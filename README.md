<div align="center">

# intel-amt-linux

**Native Linux GUI + CLI for Intel AMT / vPro out-of-band management**

[![CI](https://img.shields.io/github/actions/workflow/status/88plug/intel-amt-linux/ci.yml?style=flat-square&label=ci)](https://github.com/88plug/intel-amt-linux/actions/workflows/ci.yml)
[![AUR](https://img.shields.io/aur/version/intel-amt-linux?style=flat-square)](https://aur.archlinux.org/packages/intel-amt-linux)
[![Release](https://img.shields.io/github/v/release/88plug/intel-amt-linux?style=flat-square)](https://github.com/88plug/intel-amt-linux/releases)
[![License: FSL-1.1-ALv2](https://img.shields.io/badge/license-FSL--1.1--ALv2-blue?style=flat-square)](LICENSE.md)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/88plug/intel-amt-linux)

Power control · KVM · Serial-over-LAN · IDER virtual media · WiFi · Audit log — all from Linux.

**MeshCommander / IPMI / iLO alternative for Intel vPro machines.**

*Not affiliated with or endorsed by Intel Corporation.*

</div>

---

## Install

```bash
# Arch / Manjaro
yay -S intel-amt-linux

# All distros
git clone https://github.com/88plug/intel-amt-linux
cd intel-amt-linux
npm run setup && npm start
```

> **Requires:** Node.js 18+, npm, `msitools` — see [Prerequisites](#prerequisites)

---

## What it does

Intel® Manageability Commander is the only GUI that exposes the full Intel AMT / vPro feature set. Intel never shipped a Linux build. This port fixes that — ~350 lines of Linux glue replacing Windows-only native modules, with the IMC binary downloaded from Intel's servers at setup time.

## Feature Status

| Feature | Status |
|---|---|
| Power on/off/reset/cycle | ✅ Full |
| Boot options (PXE, USB, DVD) | ✅ Full |
| Serial-over-LAN (SOL) console | ✅ Full |
| IDER (virtual media — ISO/floppy boot) | ✅ Full |
| System inventory / AMT version | ✅ Full |
| Audit log | ✅ Full |
| TLS certificate management | ✅ Full |
| WiFi profile management | ✅ Full |
| OS keyring credential vault | ✅ Full |
| AMT NIC config CLI (`amt-net`) | ✅ Full |
| KVM remote desktop | ⚠️ CCM mode requires user consent; ACM = full access |
| Kerberos domain auth | ❌ Windows-only — digest auth works |

---

## Compatible Hardware

Works on any Intel vPro Enterprise system with AMT 6.0 or later:

| Intel Generation | Years | AMT | Chipsets |
|---|---|---|---|
| 1st gen Core (Nehalem) | 2010 | 6.0 | Q57, QM57 |
| Sandy Bridge | 2011 | 7.0 | Q67, QM67 |
| Ivy Bridge | 2012 | 8.0 | Q77, QM77 |
| Haswell | 2013–14 | 9.x | Q85/Q87 |
| Broadwell | 2015 | 10.0 | — |
| Skylake | 2015–16 | 11.0 | Q150/Q170 |
| Kaby / Coffee Lake | 2017–19 | 11.6–12.0 | Q270/Q370 |
| Comet / Tiger Lake | 2020–21 | 14–15.0 | Q470 |
| Alder / Raptor Lake | 2022–23 | 16.x | Q670, Q670E |
| Meteor Lake / Core Ultra | 2024+ | 17–18.x | latest |

**OEMs:** Lenovo ThinkPad/ThinkStation/ThinkCentre · Dell OptiPlex/Latitude/Precision · HP EliteBook/EliteDesk/Z-series · Intel NUC Pro

**Does NOT work on:**
- Consumer chipsets (H/B/Z series — no AMT firmware)
- AMD (different protocol — DASH, incompatible)
- Xeon Scalable servers (use BMC/IPMI/Redfish, not AMT)
- vPro Essentials (Alder Lake+, in-band only — no OOB redirection)

---

## Prerequisites

- Linux x86-64 (tested: Manjaro, Debian/Ubuntu, Fedora)
- Node.js 18+, npm
- `msitools` (`msiextract`) — for unpacking the Intel MSI
  ```bash
  # Arch/Manjaro:  sudo pacman -S msitools
  # Debian/Ubuntu: sudo apt install msitools
  # Fedora:        sudo dnf install msitools
  ```
- Docker (optional, for container run or LMS proxy)

## Quick Start

```bash
git clone https://github.com/88plug/intel-amt-linux
cd intel-amt-linux
npm run setup    # downloads Intel IMC 2.4.0, installs deps, applies Linux patches
npm start        # launches IMC natively
```

## Run Modes

**Native** (requires local X11 display):
```bash
bash scripts/run.sh
```

**Docker — X11 forwarded to your desktop:**
```bash
xhost +local:docker
bash scripts/run.sh docker
```

**Docker — headless, VNC on port 5900:**
```bash
docker build -t intel-amt-linux .
docker run --rm --network host -p 5900:5900 intel-amt-linux
# connect: vncviewer localhost:5900
```

## Connecting to AMT

1. Launch IMC → click **+** to add a system
2. Enter AMT hostname or IP (separate from the OS IP — AMT has its own NIC stack)
3. Auth mode: **Digest**
4. Username: `admin`
5. Password: your AMT provisioning password
6. TLS: **Yes** (port 16993) — recommended; or No (port 16992) for testing

```bash
# Find AMT IPs on your subnet:
nmap -p 16992,16993 192.168.1.0/24 --open -oG - | grep 'open'
```

## Local AMT Access (same machine)

AMT runs its own TCP/IP stack on the Intel ME — the host OS cannot reach it via
loopback without LMS (Local Manageability Service). Run the LMS Docker container
to proxy `/dev/mei0` to `localhost:16992/16993`:

```bash
bash scripts/lms.sh build    # build image once
bash scripts/lms.sh start    # starts container, binds localhost:16992/16993
bash scripts/lms.sh stop
bash scripts/lms.sh status
```

`run.sh` auto-starts LMS if the image exists and `/dev/mei0` is present.
After LMS is running, connect IMC to `localhost` instead of the AMT IP.

> **Note:** LMS proxies WS-Man ports 16992/16993 only. IDER/SOL (Redirection Protocol, 16994/16995) are OOB-only — they require direct network access to the AMT IP from a separate machine.

## Credential Vault

Passwords are encrypted with the OS keyring (libsecret / KWallet) via Electron `safeStorage`. When the auth dialog appears, check **"Remember credentials"** — credentials auto-fill on next connection. No plaintext storage.

## AMT Network CLI

```bash
# Read current AMT NIC settings
node src/tools/amt-net.js get 192.168.1.106 admin <pass>

# Switch AMT NIC to DHCP
node src/tools/amt-net.js dhcp 192.168.1.106 admin <pass>

# Set static IP
node src/tools/amt-net.js static 192.168.1.106 admin <pass> 10.0.0.5 255.255.255.0 10.0.0.1 8.8.8.8

# TLS (port 16993)
node src/tools/amt-net.js get 192.168.1.106 admin <pass> --tls
```

## Architecture

```
src/
├── imrsdk/
│   ├── amt-protocol.js   # AMT Redirection Protocol transport
│   │                     # TCP/TLS connect → HTTP Digest auth → binary AMT frames
│   │                     # IPv6 RFC 2732, CSME 16.1+ TLS auto-upgrade (16994→16995)
│   ├── amt-ider.js       # IDER/SCSI engine: READ10, INQUIRY, MODE_SENSE, READ_CAPACITY
│   └── index.js          # Sync API wrapper (deasync) — matches imrsdk.node contract
├── stubs/
│   └── krb-ticket/       # Kerberos stub → digest auth fallback
├── preload.js            # @electron/remote shim + credential vault MutationObserver
└── tools/
    └── amt-net.js        # CLI: read/write AMT_EthernetPortSettings via WS-Man
```

## What This Port Changes

This repo contains only Linux glue (~350 lines). IMC itself is downloaded from Intel's servers at setup time and is not redistributed.

| Component | Problem | Fix |
|---|---|---|
| `imrsdk.node` | PE32 Windows DLL | Reimplemented from Intel AMT spec (§6–7): TCP/TLS transport + SCSI/IDER engine |
| `krb-ticket.node` | Windows Kerberos native binding | Linux stub — digest auth still works |
| `winreg` | Windows registry | Already safe on Linux (IMC has try/catch) |
| Electron | 8.0.3 Windows build | Electron 28 (Chromium 120, TLS 1.3, `@electron/remote` shim) |

**Why Electron 28?** Electron 13's Chromium 91 has confirmed TLS handshake failures against AMT 16.x endpoints. Electron 28 ships Chromium 120 with TLS 1.3. The `remote` module removed in Electron 14+ is restored via `@electron/remote` + a preload shim.

**Why no `libimrsdk.so`?** Intel shipped IMRSDK as static `.a` files compiled without `-fPIC` — confirmed `double-stricmp` linker error. The IDER protocol is documented in Intel's AMT Implementation Guide §6–7; we implemented it directly in JS.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports need: AMT version, OEM/chipset, distro, `/dev/mei0` presence, and the exact error.

## Security

AMT credential handling and TLS issues: see [SECURITY.md](SECURITY.md).

## License

Our code (this repo): MIT — see [LICENSE](LICENSE).
Intel® Manageability Commander: proprietary Intel software, downloaded from Intel's servers at setup time.

Intel®, Intel vPro®, and Intel® Manageability Commander are trademarks of Intel Corporation or its subsidiaries.
