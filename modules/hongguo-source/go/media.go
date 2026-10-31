package core

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/beilunyang/openhongguo/sdk"
	"github.com/beilunyang/openhongguo/sdk/model"
)

const maxMediaBytes = 64 << 20

var errUnsupportedMedia = errors.New("unsupported protected media")
var errMediaTooLarge = errors.New("media exceeds memory limit")

func (c *Client) prepareProtected(ctx context.Context, playback *model.Playback, generation uint64) (*model.Playback, error) {
	c.prepareMu.Lock()
	defer c.prepareMu.Unlock()
	c.mediaMu.Lock()
	current := generation == c.generation
	c.mediaMu.Unlock()
	if !current || ctx.Err() != nil {
		return nil, context.Canceled
	}
	if playback.AudioURL != "" {
		return nil, errUnsupportedMedia
	}
	candidates := make([]model.Stream, 0, len(playback.Streams))
	for _, stream := range playback.Streams {
		if stream.Protected && !stream.HLS && !stream.Dash && stream.URL != "" && (stream.Encryption == "" || stream.Encryption == "cenc-aes-ctr") && stream.Size <= maxMediaBytes {
			candidates = append(candidates, stream)
		}
	}
	if len(candidates) == 0 {
		return nil, errUnsupportedMedia
	}
	// Prefer AVC for broad native decoder availability, then choose its best size.
	sort.SliceStable(candidates, func(i, j int) bool {
		avc := func(s model.Stream) bool {
			v := strings.ToLower(s.Codec)
			return v == "h264" || v == "avc" || v == "avc1"
		}
		if avc(candidates[i]) != avc(candidates[j]) {
			return avc(candidates[i])
		}
		return candidates[i].Height > candidates[j].Height
	})
	stream := candidates[0]
	if playback.ExpiresAt > 0 && playback.ExpiresAt <= time.Now().Unix() {
		return nil, sdk.ErrContentUnavailable
	}
	keyInfo, err := sdk.ContentKey(playback)
	if err != nil {
		return nil, sdk.ErrDRMProtected
	}
	key, err := hex.DecodeString(keyInfo.Hex)
	keyInfo.Hex = ""
	if err != nil || len(key) != 16 {
		return nil, sdk.ErrDRMProtected
	}
	defer func() {
		for i := range key {
			key[i] = 0
		}
	}()
	return c.prepareWithKey(ctx, playback, stream, key, generation)
}

func (c *Client) prepareWithKey(ctx context.Context, playback *model.Playback, stream model.Stream, key []byte, generation uint64) (*model.Playback, error) {
	fetch := c.fetch
	if fetch == nil {
		fetch = fetchProtectedMedia
	}
	encrypted, err := fetch(ctx, stream.URL)
	if err != nil {
		return nil, err
	}
	clearMedia, err := decryptMP4(encrypted, key)
	if err != nil {
		return nil, errUnsupportedMedia
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	localURL, err := c.installMedia(ctx, generation, clearMedia)
	if err != nil {
		return nil, err
	}
	return &model.Playback{
		EpisodeID: playback.EpisodeID, MediaType: "video", DurationSeconds: playback.DurationSeconds,
		Streams: []model.Stream{{URL: localURL, Definition: stream.Definition, Quality: stream.Quality, Codec: stream.Codec, Width: stream.Width, Height: stream.Height, Size: int64(len(clearMedia))}},
	}, nil
}

func (c *Client) installMedia(ctx context.Context, generation uint64, data []byte) (string, error) {
	c.mediaMu.Lock()
	defer c.mediaMu.Unlock()
	if generation != c.generation || ctx.Err() != nil || c.ctx.Err() != nil {
		return "", context.Canceled
	}
	if c.media == nil {
		var err error
		c.media, err = newMediaServer()
		if err != nil {
			return "", sdk.ErrTransport
		}
	}
	return c.media.install(data)
}

// Requests only an absolute HTTPS URL without credentials, IP literals, custom
// ports or fragments. DNS is resolved again by the guarded dialer below.
func validatedRemoteURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Fragment != "" || (u.Port() != "" && u.Port() != "443") {
		return nil, errUnsupportedMedia
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "" || !strings.Contains(host, ".") || net.ParseIP(host) != nil || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".localhost") {
		return nil, errUnsupportedMedia
	}
	return u, nil
}

func publicIP(ip net.IP) bool {
	return ip != nil && ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified() && !(ip.To4() != nil && ip.To4()[0] == 100 && ip.To4()[1] >= 64 && ip.To4()[1] <= 127)
}

func publicDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || port != "443" {
		return nil, errUnsupportedMedia
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, sdk.ErrTransport
	}
	// Reject mixed public/private results rather than selecting a convenient one.
	for _, ip := range ips {
		if !publicIP(ip.IP) {
			return nil, errUnsupportedMedia
		}
	}
	for _, ip := range ips {
		conn, err := (&net.Dialer{Timeout: 12 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
	}
	return nil, sdk.ErrTransport
}

func fetchProtectedMedia(ctx context.Context, raw string) ([]byte, error) {
	target, err := validatedRemoteURL(raw)
	if err != nil {
		return nil, err
	}
	transport := &http.Transport{Proxy: nil, DialContext: publicDial, TLSHandshakeTimeout: 12 * time.Second, ResponseHeaderTimeout: 20 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 80 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errUnsupportedMedia
		}
		next, err := validatedRemoteURL(req.URL.String())
		if err != nil || !strings.EqualFold(next.Hostname(), target.Hostname()) {
			return errUnsupportedMedia
		}
		return nil
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, errUnsupportedMedia
	}
	req.Header.Set("Accept", "video/mp4,application/octet-stream")
	req.Header.Set("Accept-Encoding", "identity")
	response, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, sdk.ErrTransport
	}
	defer response.Body.Close()
	return readMediaResponse(response, maxMediaBytes)
}

func readMediaResponse(response *http.Response, limit int64) ([]byte, error) {
	switch response.StatusCode {
	case 401, 403:
		return nil, sdk.ErrAuthenticationRequired
	case 429:
		return nil, sdk.ErrRateLimited
	case 200:
	default:
		return nil, sdk.ErrContentUnavailable
	}
	if response.ContentLength > limit {
		return nil, errMediaTooLarge
	}
	if enc := response.Header.Get("Content-Encoding"); enc != "" && enc != "identity" {
		return nil, errUnsupportedMedia
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, sdk.ErrTransport
	}
	if int64(len(data)) > limit {
		return nil, errMediaTooLarge
	}
	if len(data) < 16 {
		return nil, errUnsupportedMedia
	}
	return data, nil
}

type mediaSession struct {
	token   string
	data    []byte
	created time.Time
}
type mediaServer struct {
	server  *http.Server
	address string
	mu      sync.RWMutex
	session *mediaSession
}

func newMediaServer() (*mediaServer, error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	m := &mediaServer{address: listener.Addr().String()}
	m.server = &http.Server{Handler: http.HandlerFunc(m.serve), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 20 * time.Second}
	go func() { _ = m.server.Serve(listener) }()
	return m, nil
}

func (m *mediaServer) install(data []byte) (string, error) {
	if len(data) == 0 || len(data) > maxMediaBytes {
		return "", errMediaTooLarge
	}
	random := make([]byte, 24)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	session := &mediaSession{token: hex.EncodeToString(random), data: data, created: time.Now()}
	m.mu.Lock()
	m.session = session
	m.mu.Unlock()
	return "http://" + m.address + "/media/" + session.token + ".mp4", nil
}

func (m *mediaServer) serve(w http.ResponseWriter, r *http.Request) {
	if r.Context().Err() != nil {
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if r.Host != m.address || r.Header.Get("Origin") != "" {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	m.mu.RLock()
	session := m.session
	m.mu.RUnlock()
	if session == nil || r.URL.Path != "/media/"+session.token+".mp4" || r.URL.RawQuery != "" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "episode.mp4", session.created, bytes.NewReader(session.data))
}

func (m *mediaServer) clear() { m.mu.Lock(); m.session = nil; m.mu.Unlock() }
func (m *mediaServer) close() { _ = m.server.Close(); m.clear() }
