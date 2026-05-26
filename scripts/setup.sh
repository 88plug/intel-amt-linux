#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO/upstream/app"

# IMC 2.4.0 — fetch from Intel's server or Wayback Machine
IMC_VERSION="2.4.0"
IMC_MSI="IMCInstaller-${IMC_VERSION}.msi"
IMC_SHA256="337609a035769f077b250b2dcc41b189d54cd86089ad08f20c3358afcd6b92b3"
IMC_EXTRACT="/tmp/imc-extract"
# Primary: Intel download center (requires browser/redirect; use archive as fallback)
IMC_URL_ARCHIVE="https://web.archive.org/web/2025/https://downloadmirror.intel.com/821227/${IMC_MSI}"

echo "=== IMC Linux Port Setup (${IMC_VERSION}) ==="

# ---- 0. Check tools ----
for cmd in msiextract npm node; do
    command -v "$cmd" &>/dev/null || { echo "Missing: $cmd (install msitools for msiextract)"; exit 1; }
done

# ---- 1. Download and extract IMC MSI ----
if [ ! -d "$APP_DIR/script" ]; then
    MSI_PATH="${IMC_EXTRACT}/${IMC_MSI}"

    if [ -f "$MSI_PATH" ]; then
        echo "[1/6] IMC MSI already present at $MSI_PATH"
    else
        echo "[1/6] Downloading Intel Manageability Commander ${IMC_VERSION}..."
        mkdir -p "$IMC_EXTRACT"
        if ! curl -L --progress-bar -o "$MSI_PATH" "$IMC_URL_ARCHIVE"; then
            echo "Download failed. Manually download ${IMC_MSI} from Intel Download Center"
            echo "and place it at ${MSI_PATH}, then re-run setup."
            exit 1
        fi
    fi

    echo "      Verifying checksum..."
    echo "${IMC_SHA256}  ${MSI_PATH}" | sha256sum -c - || {
        echo "Checksum mismatch — download may be corrupted or a different version."
        exit 1
    }

    echo "      Extracting MSI..."
    msiextract "$MSI_PATH" -C "$IMC_EXTRACT"
    IMC_SRC="${IMC_EXTRACT}/Program Files/Intel/Intel Manageability Commander/resources/app"

    echo "      Copying app..."
    mkdir -p "$APP_DIR"
    cp -r "$IMC_SRC/." "$APP_DIR/"
else
    echo "[1/6] Upstream app already present — skipping download"
fi

# ---- 2. Install Electron 28 ----
echo "[2/6] Installing Electron 28..."
cd "$REPO"
npm install --no-audit 2>/dev/null | tail -2 || true

# ---- 3. Install deasync (sync bridge for IDER async→sync) ----
echo "[3/6] Installing deasync in app..."
npm install --prefix "$APP_DIR" deasync --no-save --no-audit 2>/dev/null | tail -2 || true

# ---- 4. Replace Windows-only native modules ----
echo "[4/6] Replacing Windows-only native modules..."

IMR_DEST="$APP_DIR/node_modules/imrsdk"
mkdir -p "$IMR_DEST"
cp "$REPO/src/imrsdk/index.js"       "$IMR_DEST/index.js"
cp "$REPO/src/imrsdk/amt-protocol.js" "$IMR_DEST/amt-protocol.js"
cp "$REPO/src/imrsdk/amt-ider.js"    "$IMR_DEST/amt-ider.js"
cp "$REPO/src/imrsdk/package.json"   "$IMR_DEST/package.json"

KRB_DEST="$APP_DIR/node_modules/krb-ticket"
mkdir -p "$KRB_DEST"
cp "$REPO/src/stubs/krb-ticket/index.js"     "$KRB_DEST/index.js"
cp "$REPO/src/stubs/krb-ticket/package.json" "$KRB_DEST/package.json"

echo "      imrsdk    → JS IDER engine (Apache 2.0)"
echo "      krb-ticket → Linux stub (digest auth works)"
echo "      winreg    → safe on Linux (IMC has try/catch)"

# ---- 5. Install remaining app deps ----
echo "[5/6] Installing app npm deps..."
cd "$APP_DIR"
npm install level requirejs requirejs-text winston --no-audit 2>/dev/null | tail -2 || true

# ---- 6. Install @electron/remote + patch main-electron.js for Electron 28 ----
echo "[6/6] Installing @electron/remote and patching main-electron.js..."
npm install --prefix "$APP_DIR" @electron/remote --no-audit 2>/dev/null | tail -1 || true

# Write preload shim: re-exposes @electron/remote as require('electron').remote
cat > "$APP_DIR/preload.js" << 'PRELOAD'
'use strict';
const remote = require('@electron/remote');
Object.defineProperty(require('electron'), 'remote', { get: () => remote });
PRELOAD

if ! grep -q "@electron/remote" "$APP_DIR/main-electron.js" 2>/dev/null; then
    sed -i '/tls-min-v1.1/d' "$APP_DIR/main-electron.js"
    sed -i '/enableRemoteModule/d' "$APP_DIR/main-electron.js"
    sed -i "s|const { app, BrowserWindow } = require('electron');|const { app, BrowserWindow } = require('electron');\nconst remoteMain = require('@electron/remote/main');\nremoteMain.initialize();|" \
        "$APP_DIR/main-electron.js"
    sed -i "s|nodeIntegration: true,|nodeIntegration: true,\n            contextIsolation: false,\n            preload: require('path').join(__dirname, 'preload.js'),|" \
        "$APP_DIR/main-electron.js"
    sed -i "s|win.removeMenu();|remoteMain.enable(win.webContents);\n    win.removeMenu();|" \
        "$APP_DIR/main-electron.js"
    echo "      Patched: Electron 28 + @electron/remote shim"
else
    echo "      Already patched"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Run native:  bash scripts/run.sh"
echo "Run docker:  bash scripts/run.sh docker"
echo "Run VNC:     docker run --rm --network host -p 5900:5900 \$(docker build -q .)"
