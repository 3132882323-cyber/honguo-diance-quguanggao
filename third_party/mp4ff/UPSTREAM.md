# Vendored source provenance

Repository: https://github.com/Eyevinn/mp4ff

Commit: 702346275b141f91c229e5a759822d70d883d55c

Commit timestamp: 2026-10-23T17:01:29+02:00

Retrieved: 2026-10-31

License: MIT. Copyright (c) 2019-2022 Edgeware AB, 2023- Eyevinn Technology AB. The original LICENSE is preserved in this directory.

The complete pinned working tree is included except `.git` metadata. No upstream implementation was changed; this UPSTREAM.md is an added provenance note. The Go bridge uses a local replace directive to compile this source. Its MP4 parser, sample-table model, CENC sample cryptography and fragmented-media decryption are reused; the bounded progressive-media adapter and loopback media server are original code under modules/hongguo-source/go.

Tests for this app generate synthetic CENC containers and payloads in memory. No Hongguo episode was downloaded to validate this integration. MP4 container/cryptography tests do not by themselves prove native video decoder compatibility.
