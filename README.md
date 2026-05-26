# Intel Manageability Commander — Linux Port

Runs Intel's official AMT management GUI natively on Linux. No Windows. No VM.

Intel IMC is the only GUI tool that exposes the full Intel AMT/vPro feature set —
power control, SOL console, IDER (virtual media boot), KVM, audit log, WiFi, TLS
provisioning. Intel never released a Linux build. This port fixes that.

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

## What This Port Changes

This repo contains only our Linux glue (~350 lines). IMC itself is downloaded
from Intel's servers at setup time and is not redistributed.

| Component | Problem | Fix |
|---|---|---|
| `imrsdk.node` | PE32 Windows DLL — wraps `imrsdk.dll` | Reimplemented from Intel AMT spec (§6–7): TCP/TLS transport + SCSI/IDER engine |
| `krb-ticket.node` | Windows Kerberos native binding | Linux stub — digest auth still works |
| `winreg` | Windows registry | Already safe on Linux (IMC has try/catch) |
| Electron | 8.0.3 Windows build | Electron 13 (last version with built-in `remote` API) |

**Why no `libimrsdk.so`?** Intel only shipped the IMRSDK as static `.a` files
compiled without `-fPIC`. They cannot link into a `.so` (confirmed double-`stricmp`
linker error from xerces bundled inside). The IDER protocol is public in Intel's
AMT Implementation Guide §6–7 — we implemented it directly.

## Prerequisites

- Linux x86-64 (tested: Manjaro, Debian/Ubuntu, Fedora)
- Node.js 18+, npm
- `msitools` (`msiextract`) — for unpacking the Intel MSI
  ```
  # Arch/Manjaro:  sudo pacman -S msitools
  # Debian/Ubuntu: sudo apt install msitools
  # Fedora:        sudo dnf install msitools
  ```
- Docker (optional, for container run)

## Quick Start

```bash
git clone https://github.com/88plug/imc-linux-port
cd imc-linux-port
npm run setup    # downloads IMC from Intel, installs deps, applies Linux patches
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
docker build -t imc-linux .
docker run --rm --network host -p 5900:5900 imc-linux
# connect: vncviewer localhost:5900
```

## Connecting to AMT

1. Launch IMC → click **+** to add a system
2. Enter AMT hostname or IP (separate from the OS IP — AMT has its own NIC stack)
3. Auth mode: **Digest**
4. Username: `admin`
5. Password: your AMT provisioning password
6. TLS: **Yes** (port 16993) — recommended; or No (port 16992) for testing

AMT IP can differ from the OS IP. Check your router DHCP table or run:
```bash
# Find AMT IP if on same subnet:
nmap -p 16992,16993 192.168.1.0/24 --open -oG - | grep 'open'
```

## Architecture

```
src/
├── imrsdk/
│   ├── amt-protocol.js   # AMT Redirection Protocol transport
│   │                     # TCP/TLS connect → HTTP Digest auth → binary AMT frames
│   ├── amt-ider.js       # IDER protocol: SCSI handler + disk image serving
│   │                     # Handles READ10, INQUIRY, MODE_SENSE, READ_CAPACITY, READ_TOC
│   └── index.js          # Sync API wrapper (deasync) — matches imrsdk.node contract
└── stubs/
    └── krb-ticket/
        └── index.js      # Kerberos stub: retCode:1, falls back to digest auth
```

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
| KVM remote desktop | ⚠️ CCM mode requires user consent; ACM mode = full access |
| Kerberos domain auth | ❌ Windows only — digest auth works |
| Windows registry credential storage | ❌ Windows only — credentials cleared on exit |

## License

Our code (this repo): MIT — see [LICENSE](LICENSE).
Intel Manageability Commander: proprietary Intel software, downloaded from Intel's servers.
