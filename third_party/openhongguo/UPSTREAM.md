# Vendored source provenance

Repository: https://github.com/beilunyang/openhongguo

Commit: b587ef33068e91f47e1543f3c8be564fad454143

Commit timestamp: 2026-10-31T14:24:45+08:00

Retrieved: 2026-10-31

License: Apache-2.0, full original text in LICENSE. The original README contains additional research/noncommercial disclaimer wording and has been preserved unchanged.

All files from the pinned working tree are included, excluding only `.git` metadata. This UPSTREAM.md file is the only added provenance file; upstream implementation files were not modified. No upstream CLI, downloaded release binary, live-contract test, device reset loop or real-media download was executed during vendoring.

The app builds its own narrow bridge from `modules/hongguo-source/go`, using a local Go replace directive to this source tree. It does not invoke the upstream multi-language dispatcher. For a supported protected playback model, the app calls the published sdk.ContentKey helper privately in Go, then prepares standard CENC media through its source-built MP4 path. It does not export keys to JavaScript, rotate device identities, or extract official APK material. Source-complete binary outputs are generated locally by the mobile build script and are excluded from source control.
