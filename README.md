# Intel Manageability Commander — Linux Port

Ports Intel IMC 2.4.0 (Windows Electron app) to run natively on Linux.

## What changed

| Component | Original | Linux port |
|-----------|----------|------------|
| `imrsdk.node` | PE32 Windows DLL (wraps `imrsdk.dll`) | Pure JS IDER engine (Intel AMT protocol in Node.js) |
| `krb-ticket.node` | Windows Kerberos native binding | Linux stub — digest auth still works |
| `winreg` | Windows registry | Already safe on Linux (try/catch in IMC source) |
| Electron | 8.0.3 (Windows) | 13.x (Linux, last with `remote` API) |

**Why no `libimrsdk.so`?** Intel only shipped the IMRSDK as non-PIC static `.a` files for RHEL/SuSE.
These cannot link into a `.so` (confirmed linker bug: `stricmp` defined twice between imrsdk and xerces).
The IDER protocol is reimplemented in JS using the same TCP/SCSI framing Intel used.

## Prerequisites

- Node.js 18+ and npm
- Electron 13 (installed by setup.sh)
- Intel IMC 2.4.0 MSI extracted to `/tmp/imc-extract/`
  - Download from Wayback Machine (IMCInstaller-2.4.0.msi)
  - Extract: `msiextract IMCInstaller-2.4.0.msi -C /tmp/imc-extract/`

## Setup

```bash
npm run setup     # copies app, installs deps, wires Linux replacements
```

## Run

**Native (needs local display):**
```bash
bash scripts/run.sh
# or
bash scripts/run.sh native
```

**Docker — X11 forwarded to host display:**
```bash
bash scripts/run.sh docker
```
Requires `xhost +local:docker` on the host first.

**Docker — headless with VNC (no local X11 needed):**
```bash
docker build -t imc-linux .
docker run --rm --network host -p 5900:5900 imc-linux
# then: vncviewer localhost:5900
```

## AMT connection (digest auth)

1. Add system → enter AMT hostname/IP (192.168.1.106 for this machine)
2. Auth mode: Digest
3. Username: `admin`  Password: see `~/.amt-mebx-password.txt`
4. TLS: yes (port 16993) or no (port 16992)

## IDER (virtual media boot)

Works via pure JS IDER engine. Mounts `.img` (floppy) or `.iso` (CD-ROM) to AMT.
Synchronous API preserved via `deasync` so no IMC JS patches needed.

## What still needs work

- Kerberos domain auth (Windows-only, stub returns "not supported")
- KVM (requires ACM provisioning; machine is in CCM mode)
- Windows registry credential storage (falls back to in-memory, cleared on exit)
