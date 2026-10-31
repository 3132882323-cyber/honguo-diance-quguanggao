package core

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/beilunyang/openhongguo/adapters/memstore"
	"github.com/beilunyang/openhongguo/sdk"
)

type fixtureTransport struct {
	body  []byte
	calls int
}

func (f *fixtureTransport) Do(_ context.Context, req *sdk.Request) (*sdk.Response, error) {
	f.calls++
	if !strings.Contains(req.URL, "/novel/player/video_model/v1/") {
		return nil, errors.New("unexpected network route in offline test")
	}
	return &sdk.Response{StatusCode: 200, Body: f.body}, nil
}

func fixtureClient(t *testing.T, name string) (*Client, *fixtureTransport) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "third_party", "openhongguo", "testdata", "protocol", name))
	if err != nil {
		t.Fatal(err)
	}
	transport := &fixtureTransport{body: raw}
	store := memstore.New()
	if err := store.Save(context.Background(), &sdk.DeviceProfile{DeviceID: "10001", InstallID: "20001", TTReq: "offline-fixture"}); err != nil {
		t.Fatal(err)
	}
	client, err := sdk.NewClient(sdk.Options{Transport: transport, ProfileStore: store, RetryAttempts: 1})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return &Client{c: client, ctx: ctx, cancel: cancel, fetch: func(context.Context, string) ([]byte, error) { return nil, sdk.ErrDRMProtected }}, transport
}

func TestProtectedModelReturnsOnlyTypedError(t *testing.T) {
	client, transport := fixtureClient(t, "drm-playback.json")
	value, err := client.invoke(context.Background(), "resolve", `["1234567890"]`)
	if !errors.Is(err, sdk.ErrDRMProtected) || value != nil {
		t.Fatalf("expected protected result, got %T %v", value, err)
	}
	encoded := envelope(value, err)
	if strings.Contains(encoded, "contentKey") || strings.Contains(encoded, "spade") || strings.Contains(encoded, "https://") {
		t.Fatal("protected response leaked a media URL or key material")
	}
	var result struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(encoded), &result); err != nil {
		t.Fatal(err)
	}
	if result.Error.Code != "DRM_PROTECTED" {
		t.Fatal(result.Error.Code)
	}
	if transport.calls != 1 {
		t.Fatalf("unexpected retries: %d", transport.calls)
	}
}

func TestClearFixtureCanBeReturnedWithoutDecryption(t *testing.T) {
	client, transport := fixtureClient(t, "clear-playback.json")
	value, err := client.invoke(context.Background(), "resolve", `["1234567890"]`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(envelope(value, nil), "https://media.invalid/clear-360.mp4") {
		t.Fatal("clear fixture stream missing")
	}
	if transport.calls != 1 {
		t.Fatalf("unexpected retries: %d", transport.calls)
	}
}

func TestNoResetOrKeyExportMethod(t *testing.T) {
	client, transport := fixtureClient(t, "clear-playback.json")
	for _, method := range []string{"resetDevice", "contentKey", "download"} {
		if _, err := client.invoke(context.Background(), method, `[]`); err == nil {
			t.Fatalf("unexpected exposed method: %s", method)
		}
	}
	if transport.calls != 0 {
		t.Fatal("unsupported method sent a network request")
	}
}
