package core

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Eyevinn/mp4ff/mp4"
	"github.com/beilunyang/openhongguo/sdk/model"
)

func syntheticCENC(t *testing.T, fragmented, subsamples bool, ivSize int) ([]byte, []byte, []byte) {
	t.Helper()
	key := bytes.Repeat([]byte{0x21}, 16)
	iv := bytes.Repeat([]byte{0x35}, ivSize)
	plain := []byte("synthetic audio sample payload for CENC contract")
	init := mp4.CreateEmptyInit()
	track := init.AddEmptyTrack(48000, "audio", "und")
	if err := track.SetAACDescriptor(2, 48000); err != nil {
		t.Fatal(err)
	}
	info, err := mp4.InitProtect(init, key, iv, "cenc", mp4.UUID(bytes.Repeat([]byte{0x42}, 16)), nil)
	if err != nil {
		t.Fatal(err)
	}
	output := &bytes.Buffer{}
	if fragmented {
		fragment, err := mp4.CreateFragment(1, 1)
		if err != nil {
			t.Fatal(err)
		}
		fragment.AddFullSample(mp4.FullSample{Sample: mp4.Sample{Dur: 1024, Size: uint32(len(plain)), Flags: 0x02000000}, Data: append([]byte{}, plain...)})
		if _, err := mp4.EncryptFragment(fragment, key, iv, info); err != nil {
			t.Fatal(err)
		}
		if err := init.Encode(output); err != nil {
			t.Fatal(err)
		}
		if err := fragment.Encode(output); err != nil {
			t.Fatal(err)
		}
	} else {
		// A two-sample progressive file with explicit CENC IV/subsample records.
		init.Moov.Mvex = nil
		children := init.Moov.Children[:0]
		for _, box := range init.Moov.Children {
			if box.Type() != "mvex" {
				children = append(children, box)
			}
		}
		init.Moov.Children = children
		table := track.Mdia.Minf.Stbl
		table.Stsz.SampleNumber = 2
		table.Stsz.SampleSize = []uint32{uint32(len(plain)), uint32(len(plain))}
		if err := table.Stsc.AddEntry(1, 2, 1); err != nil {
			t.Fatal(err)
		}
		table.Stts.SampleCount = []uint32{2}
		table.Stts.SampleTimeDelta = []uint32{1024}
		senc := mp4.CreateSencBox()
		encrypted := make([]byte, 0, len(plain)*2)
		for i := byte(0); i < 2; i++ {
			sampleIV := append([]byte{}, iv...)
			sampleIV[len(sampleIV)-1] += i
			paddedIV := make([]byte, 16)
			copy(paddedIV, sampleIV)
			var patterns []mp4.SubSamplePattern
			if subsamples {
				patterns = []mp4.SubSamplePattern{{BytesOfClearData: 4, BytesOfProtectedData: uint32(len(plain) - 4)}}
			}
			sample := append([]byte{}, plain...)
			if err := mp4.CryptSampleCenc(sample, key, paddedIV, patterns); err != nil {
				t.Fatal(err)
			}
			encrypted = append(encrypted, sample...)
			if err := senc.AddSample(mp4.SencSample{IV: sampleIV, SubSamples: patterns}); err != nil {
				t.Fatal(err)
			}
		}
		table.AddChild(senc)
		table.Stco.ChunkOffset = []uint32{0}
		table.Stco.ChunkOffset[0] = uint32(init.Size() + 8)
		file := mp4.NewFile()
		file.AddChild(init.Ftyp, 0)
		file.AddChild(init.Moov, init.Ftyp.Size())
		file.AddChild(&mp4.MdatBox{Data: encrypted}, init.Size())
		if err := file.Encode(output); err != nil {
			t.Fatal(err)
		}
		plain = append(plain, plain...)
	}
	return output.Bytes(), key, plain
}

func TestSyntheticCENCRoundTrip(t *testing.T) {
	for _, fragmented := range []bool{false, true} {
		for _, ivSize := range []int{8, 16} {
			for _, subsamples := range []bool{false, true} {
				raw, key, expected := syntheticCENC(t, fragmented, subsamples, ivSize)
				clear, err := decryptMP4(raw, key)
				if err != nil {
					t.Fatalf("fragmented=%v iv=%d subsamples=%v: %v", fragmented, ivSize, subsamples, err)
				}
				file, err := mp4.DecodeFile(bytes.NewReader(clear))
				if err != nil {
					t.Fatal(err)
				}
				var actual []byte
				if fragmented {
					actual = file.Segments[0].Fragments[0].Mdat.Data
				} else {
					actual = file.Mdat.Data
					if len(clear) != len(raw) {
						t.Fatal("progressive chunk offsets changed")
					}
					locations, err := file.Moov.Trak.GetRangesForSampleInterval(1, 2)
					if err != nil || len(locations) != 1 || locations[0].Offset != file.Mdat.StartPos+file.Mdat.HeaderSize() {
						t.Fatal("invalid output sample offsets")
					}
				}
				if !bytes.Equal(actual, expected) {
					t.Fatalf("decrypted synthetic samples differ: fragmented=%v", fragmented)
				}
				if file.Moov.Trak.Mdia.Minf.Stbl.Stsd.Children[0].Type() != "mp4a" {
					t.Fatal("sample entry remains encrypted")
				}
			}
		}
	}
}

func TestMalformedCENCIsRejected(t *testing.T) {
	for _, raw := range [][]byte{nil, []byte("not an MP4 container"), {0, 0, 0, 8, 'm', 'o', 'o', 'v'}} {
		if _, err := decryptMP4(raw, bytes.Repeat([]byte{1}, 16)); err == nil {
			t.Fatal("accepted malformed container")
		}
	}
	raw, key, _ := syntheticCENC(t, false, false, 8)
	file, err := mp4.DecodeFile(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	file.Moov.Trak.Mdia.Minf.Stbl.Stco.ChunkOffset[0] = uint32(len(raw) + 100)
	buf := &bytes.Buffer{}
	if err := file.Encode(buf); err != nil {
		t.Fatal(err)
	}
	if _, err := decryptMP4(buf.Bytes(), key); err == nil {
		t.Fatal("accepted out-of-bounds sample")
	}
}

func TestPreparedCENCPipelineReturnsPlayableLocalModel(t *testing.T) {
	encrypted, key, expected := syntheticCENC(t, false, true, 8)
	ctx, cancel := context.WithCancel(context.Background())
	client := &Client{ctx: ctx, cancel: cancel, fetch: func(context.Context, string) ([]byte, error) { return encrypted, nil }}
	defer client.Close()
	generation := client.begin("resolve")
	prepared, err := client.prepareWithKey(ctx, &model.Playback{EpisodeID: "synthetic-episode", Protected: true}, model.Stream{URL: "https://media.invalid/synthetic.mp4", Definition: "720p", Protected: true}, key, generation)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Protected || len(prepared.Streams) != 1 || prepared.Streams[0].Protected || prepared.KeyMaterial != "" {
		t.Fatal("prepared model still reports protected media")
	}
	if !strings.HasPrefix(prepared.Streams[0].URL, "http://127.0.0.1:") {
		t.Fatal("prepared media is not local")
	}
	response, err := http.Get(prepared.Streams[0].URL)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	file, err := mp4.DecodeFile(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(file.Mdat.Data, expected) {
		t.Fatal("proxy did not serve reconstructed clear samples")
	}
}

func TestLoopbackProxyRangesHeadTokensAndClose(t *testing.T) {
	proxy, err := newMediaServer()
	if err != nil {
		t.Fatal(err)
	}
	defer proxy.close()
	payload := []byte("0123456789abcdefghijklmnopqrstuvwxyz")
	target, err := proxy.install(payload)
	if err != nil {
		t.Fatal(err)
	}
	request, _ := http.NewRequest(http.MethodGet, target, nil)
	request.Header.Set("Range", "bytes=2-7")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 206 || string(got) != "234567" || response.Header.Get("Content-Range") != "bytes 2-7/36" {
		t.Fatalf("bad Range response: %d %q", response.StatusCode, got)
	}
	head, err := http.Head(target)
	if err != nil {
		t.Fatal(err)
	}
	head.Body.Close()
	if head.ContentLength != int64(len(payload)) || head.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("bad HEAD response")
	}
	invalid, err := http.Get("http://" + proxy.address + "/media/guess.mp4")
	if err != nil {
		t.Fatal(err)
	}
	invalid.Body.Close()
	if invalid.StatusCode != 404 {
		t.Fatal("unguessable token was not checked")
	}
	_, err = proxy.install([]byte("new episode"))
	if err != nil {
		t.Fatal(err)
	}
	old, err := http.Get(target)
	if err != nil {
		t.Fatal(err)
	}
	old.Body.Close()
	if old.StatusCode != 404 {
		t.Fatal("stale token still valid")
	}
	proxy.close()
	if response, err := http.Get(target); err == nil {
		response.Body.Close()
		t.Fatal("server still reachable after close")
	}
}

func TestLatestRequestOwnsProxyAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := &Client{ctx: ctx, cancel: cancel}
	defer client.Close()
	firstContext, firstCancel, _ := client.request("resolve")
	defer firstCancel()
	_, secondCancel, _ := client.request("resolve")
	defer secondCancel()
	if !errors.Is(firstContext.Err(), context.Canceled) {
		t.Fatal("new selection did not cancel old preparation")
	}
	first := client.begin("resolve")
	second := client.begin("resolve")
	target, err := client.installMedia(ctx, second, []byte("current media"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.installMedia(ctx, first, []byte("late previous media")); !errors.Is(err, context.Canceled) {
		t.Fatal("late result installed")
	}
	response, err := http.Get(target)
	if err != nil {
		t.Fatal(err)
	}
	data, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if string(data) != "current media" {
		t.Fatal("late result invalidated active media")
	}
	cancelled, stop := context.WithCancel(ctx)
	stop()
	request := httptest.NewRequest("GET", target, nil).WithContext(cancelled)
	recorder := httptest.NewRecorder()
	client.media.serve(recorder, request)
	if recorder.Body.Len() != 0 {
		t.Fatal("cancelled proxy response wrote media")
	}
	if _, err := client.installMedia(cancelled, second, []byte("cancelled")); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled media installed")
	}
	client.CancelPlayback()
	response, err = http.Get(target)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 404 {
		t.Fatal("cancelPlayback retained the media session")
	}
}

func TestMediaFetchBoundaries(t *testing.T) {
	for _, raw := range []string{"http://cdn.example/video.mp4", "https://127.0.0.1/video.mp4", "https://user:pass@cdn.example/a", "https://cdn.example:8443/a", "https://localhost/a", "file:///a"} {
		if _, err := validatedRemoteURL(raw); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	for _, address := range []string{"127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "fc00::1", "100.64.0.1"} {
		if publicIP(net.ParseIP(address)) {
			t.Fatalf("accepted internal address %s", address)
		}
	}
	response := &http.Response{StatusCode: 200, ContentLength: -1, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(strings.Repeat("x", 17)))}
	if _, err := readMediaResponse(response, 16); !errors.Is(err, errMediaTooLarge) {
		t.Fatal("unknown content length bypassed cap")
	}
	response.ContentLength = 100
	if _, err := readMediaResponse(response, 16); !errors.Is(err, errMediaTooLarge) {
		t.Fatal("known content length bypassed cap")
	}
}
