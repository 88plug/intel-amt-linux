# Changelog

## v0.1.0 — 2026-05-26

Initial public release.

### Added
- Linux launcher for Intel® Manageability Commander 2.4.0
- `imrsdk` — pure-JS reimplementation of Windows-only `imrsdk.node` (AMT Redirection Protocol + SCSI/IDER engine)
- `krb-ticket` stub — Linux fallback to digest auth
- Electron 13 → 28 migration with `@electron/remote` shim
- LMS Docker container — proxies `/dev/mei0` to `localhost:16992/16993`
- Credential vault — OS keyring via `safeStorage`, "Remember credentials" checkbox in auth dialog
- `src/tools/amt-net.js` — WS-Man CLI for `AMT_EthernetPortSettings` (get/dhcp/static)
- CSME 16.1+ TLS enforcement — auto-upgrade cleartext 16994 → TLS 16995 on `ECONNREFUSED`
- IPv6 `Host:` bracket notation fix (RFC 2732) in AMT Redirection Protocol
- AUR package (`intel-amt-linux`)
- Setup script: auto-downloads IMC MSI from Intel's servers, verifies SHA256, patches main-electron.js
