# Security Policy

## Scope

This project handles:
- AMT credentials (digest auth passwords)
- TLS connections to AMT endpoints (self-signed certs, `rejectUnauthorized: false`)
- OS keyring encryption via Electron `safeStorage`
- Network access to out-of-band management ports (16992–16995)

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: security reports → open a [GitHub Security Advisory](https://github.com/88plug/intel-amt-linux/security/advisories/new) (private disclosure).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if known

We aim to respond within 72 hours and publish a fix within 14 days for confirmed issues.

## Known limitations (by design)

- `rejectUnauthorized: false` in TLS connections to AMT — AMT devices use self-signed certs with no CA chain. This is intentional and matches Intel's own tooling behavior. Do not use this tool over untrusted networks.
- AMT passwords stored in OS keyring are as secure as your keyring implementation (libsecret / KWallet). On headless systems without a keyring daemon, `safeStorage` falls back to plaintext — do not use the "Remember credentials" feature in that case.
- LMS Docker container binds to `0.0.0.0:16992/16993` by default — restrict with firewall rules if on a shared machine.
