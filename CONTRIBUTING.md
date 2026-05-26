# Contributing

## Before you open an issue

Bug reports for hardware-specific software need enough context to reproduce. Please include:

- **AMT version** — run `rpc amtinfo` or check MEBx
- **OEM + chipset** — e.g. "Lenovo ThinkPad P16, Q670"
- **CSME/ME firmware version** if known
- **Distro + kernel** — `uname -a`
- **Node.js version** — `node --version`
- **`/dev/mei0` present?** — `ls -la /dev/mei0`
- **Connection mode** — LMS (localhost) or direct OOB IP?
- **TLS enabled?** — port 16992 or 16993?
- **Exact error** — full console output, not a summary

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).

## Development setup

```bash
git clone https://github.com/88plug/intel-amt-linux
cd intel-amt-linux
npm run setup        # downloads Intel IMC, installs deps, applies patches
npm test             # smoke test: verifies modules load
npm start            # launch IMC
```

To iterate on `src/imrsdk/` changes without re-running full setup:

```bash
cp src/imrsdk/amt-protocol.js upstream/app/node_modules/imrsdk/amt-protocol.js
```

## What we do and don't accept

**Welcome:**
- Bug fixes with reproduction steps on real AMT hardware
- Distro compatibility fixes (Fedora, Ubuntu, NixOS, etc.)
- AUR / packaging improvements
- Documentation corrections
- TLS / IPv6 / AMT version compatibility fixes

**Out of scope:**
- Changes to Intel's proprietary code (we don't ship it)
- Features that require ACM provisioning infrastructure
- Windows support (use Intel's official IMC)
- KVM improvements (blocked by CCM consent requirement)

## Pull requests

- Target `main`
- One logical change per PR
- Test on real AMT hardware if touching `src/imrsdk/`
- `npm test` must pass

## Commit style

```
<type>: short description

types: feat, fix, docs, refactor, test, chore, packaging
```
