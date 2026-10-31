// Package core exposes a small, source-built mobile API over OpenHongguo.
// It deliberately has no device-reset, credential-import or content-key method.
package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/beilunyang/openhongguo/adapters"
	"github.com/beilunyang/openhongguo/sdk"
)

type Client struct {
	c             *sdk.Client
	ctx           context.Context
	cancel        context.CancelFunc
	mediaMu       sync.Mutex
	prepareMu     sync.Mutex
	generation    uint64
	media         *mediaServer
	fetch         func(context.Context, string) ([]byte, error)
	activeResolve context.CancelFunc
}

type Callback interface{ Done(resultJSON string) }

func NewClient(profilePath string) (*Client, error) {
	if strings.TrimSpace(profilePath) == "" {
		return nil, sdk.ErrInvalidOptions
	}
	client, err := adapters.NewClient(profilePath, sdk.Options{RetryAttempts: 1})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{c: client, ctx: ctx, cancel: cancel}, nil
}

// Close cancels work but never deletes or changes the stored device identity.
func (c *Client) Close() {
	c.cancel()
	c.mediaMu.Lock()
	defer c.mediaMu.Unlock()
	c.generation++
	if c.media != nil {
		c.media.close()
		c.media = nil
	}
}

func (c *Client) begin(method string) uint64 {
	c.mediaMu.Lock()
	defer c.mediaMu.Unlock()
	if method == "resolve" {
		c.generation++
		if c.activeResolve != nil {
			c.activeResolve()
			c.activeResolve = nil
		}
	}
	return c.generation
}

// CancelPlayback cancels the current preparation and releases the in-memory
// media session. It does not alter the persistent anonymous device profile.
func (c *Client) CancelPlayback() {
	c.mediaMu.Lock()
	defer c.mediaMu.Unlock()
	c.generation++
	if c.activeResolve != nil {
		c.activeResolve()
		c.activeResolve = nil
	}
	if c.media != nil {
		c.media.clear()
	}
}

func (c *Client) request(method string) (context.Context, context.CancelFunc, uint64) {
	c.mediaMu.Lock()
	defer c.mediaMu.Unlock()
	limit := 35 * time.Second
	if method == "resolve" {
		c.generation++
		if c.activeResolve != nil {
			c.activeResolve()
		}
		limit = 90 * time.Second
		if c.media != nil {
			c.media.clear()
		}
	}
	ctx, cancel := context.WithTimeout(c.ctx, limit)
	if method == "resolve" {
		c.activeResolve = cancel
	}
	return ctx, cancel, c.generation
}

func (c *Client) Start(method, argsJSON string, callback Callback) {
	// Assign before starting the goroutine, so an older slow result can never
	// replace media installed by a newer user selection.
	ctx, cancel, generation := c.request(method)
	go func() {
		defer cancel()
		value, err := c.invokeAt(ctx, method, argsJSON, generation)
		callback.Done(envelope(value, err))
	}()
}

func (c *Client) invoke(ctx context.Context, method, argsJSON string) (any, error) {
	return c.invokeAt(ctx, method, argsJSON, c.begin(method))
}

func (c *Client) invokeAt(ctx context.Context, method, argsJSON string, generation uint64) (any, error) {
	var args []json.RawMessage
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, sdk.ErrInvalidOptions
	}
	switch method {
	case "discover":
		var options sdk.DiscoverOptions
		if len(args) > 0 {
			if err := json.Unmarshal(args[0], &options); err != nil {
				return nil, sdk.ErrInvalidOptions
			}
		}
		return c.c.Discover(ctx, options)
	case "search":
		query, err := stringArg(args, 0)
		if err != nil || len([]rune(query)) > 200 {
			return nil, sdk.ErrInvalidOptions
		}
		options := sdk.SearchOptions{PageSize: 20}
		if len(args) > 1 {
			if err := json.Unmarshal(args[1], &options); err != nil {
				return nil, sdk.ErrInvalidOptions
			}
		}
		options.PageSize = 20
		return c.c.Search(ctx, query, options)
	case "detail":
		id, err := stringArg(args, 0)
		if err != nil {
			return nil, err
		}
		details, err := c.c.GetSeriesBatch(ctx, []string{id})
		if err != nil {
			return nil, err
		}
		if len(details) != 1 || details[0].Series == nil {
			return nil, sdk.ErrContentUnavailable
		}
		return details[0], nil
	case "suggest":
		prefix, err := stringArg(args, 0)
		if err != nil || len([]rune(prefix)) > 200 {
			return nil, sdk.ErrInvalidOptions
		}
		return c.c.Suggest(ctx, prefix)
	case "resolve":
		id, err := stringArg(args, 0)
		if err != nil {
			return nil, err
		}
		playback, err := c.c.ResolvePlayback(ctx, id, sdk.PlaybackOptions{})
		if err != nil && !errors.Is(err, sdk.ErrDRMProtected) {
			return nil, err
		}
		if playback == nil {
			return nil, sdk.ErrContentUnavailable
		}
		if playback.Protected {
			prepared, err := c.prepareProtected(ctx, playback, generation)
			if err != nil {
				return nil, err
			}
			return prepared, nil
		}
		for _, stream := range playback.Streams {
			if stream.Protected || stream.Encryption != "" {
				return nil, sdk.ErrDRMProtected
			}
		}
		if len(playback.Streams) == 0 {
			return nil, sdk.ErrContentUnavailable
		}
		// KeyMaterial is excluded by upstream JSON tags; clear it as an extra boundary.
		playback.KeyMaterial = ""
		c.mediaMu.Lock()
		defer c.mediaMu.Unlock()
		if generation != c.generation || ctx.Err() != nil {
			return nil, context.Canceled
		}
		if c.media != nil {
			c.media.clear()
		}
		return playback, nil
	default:
		return nil, fmt.Errorf("unsupported method")
	}
}

func stringArg(args []json.RawMessage, index int) (string, error) {
	if index >= len(args) {
		return "", sdk.ErrInvalidOptions
	}
	var value string
	if err := json.Unmarshal(args[index], &value); err != nil || strings.TrimSpace(value) == "" {
		return "", sdk.ErrInvalidOptions
	}
	return value, nil
}

func envelope(value any, err error) string {
	var result any
	if err != nil {
		result = map[string]any{"error": errorValue(err)}
	} else {
		result = map[string]any{"result": value}
	}
	encoded, marshalErr := json.Marshal(result)
	if marshalErr != nil {
		return `{"error":{"code":"INVALID_RESPONSE","message":"Cannot encode response"}}`
	}
	return string(encoded)
}

func errorValue(err error) map[string]any {
	code, message := "UNKNOWN", "Hongguo request failed"
	cases := []struct {
		err           error
		code, message string
	}{
		{context.Canceled, "CANCELLED", "Request cancelled"},
		{errUnsupportedMedia, "UNSUPPORTED_MEDIA", "This protected media layout is not supported"},
		{errMediaTooLarge, "MEDIA_TOO_LARGE", "Episode exceeds the memory playback limit"},
		{context.DeadlineExceeded, "TRANSPORT", "Request timed out"},
		{sdk.ErrInvalidOptions, "INVALID_OPTIONS", "Invalid provider request"},
		{sdk.ErrDRMProtected, "DRM_PROTECTED", "Protected content is not supported by this player"},
		{sdk.ErrAuthenticationRequired, "AUTHENTICATION_REQUIRED", "Service authorization required"},
		{sdk.ErrAnonymousLimited, "ANONYMOUS_LIMITED", "Service returned no anonymous result"},
		{sdk.ErrRateLimited, "RATE_LIMITED", "Service rate limit reached"},
		{sdk.ErrChallengeRequired, "CHALLENGE_REQUIRED", "Service verification required"},
		{sdk.ErrDeviceRejected, "DEVICE_REJECTED", "Anonymous device rejected by service"},
		{sdk.ErrContentUnavailable, "CONTENT_UNAVAILABLE", "Content unavailable"},
		{sdk.ErrSignatureRejected, "SIGNATURE_REJECTED", "Service rejected the request protocol"},
		{sdk.ErrSignerUnavailable, "SIGNER_UNAVAILABLE", "Request signing unavailable"},
		{sdk.ErrTransport, "TRANSPORT", "Network request failed"},
		{sdk.ErrParamInvalid, "PARAM_INVALID", "Service rejected request parameters"},
	}
	for _, candidate := range cases {
		if errors.Is(err, candidate.err) {
			code, message = candidate.code, candidate.message
			break
		}
	}
	out := map[string]any{"code": code, "message": message, "retryable": sdk.Retryable(err)}
	if errors.Is(err, sdk.ErrRateLimited) {
		if wait := sdk.RetryAfter(err, 0); wait > 0 {
			out["retryAfterMs"] = wait.Milliseconds()
		}
	}
	return out
}
