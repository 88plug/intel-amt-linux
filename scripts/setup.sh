#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO/upstream/app"
IMC_SRC="/tmp/imc-extract/extracted/Program Files/Intel/Intel Manageability Commander/resources/app"

echo "=== IMC Linux Port Setup ==="

# ---- 1. Copy upstream app if needed ----
if [ ! -d "$APP_DIR/script" ]; then
    echo "[1/6] Copying IMC app from extracted MSI..."
    mkdir -p "$APP_DIR"
    cp -r "$IMC_SRC/." "$APP_DIR/"
    echo "      Copied to $APP_DIR"
else
    echo "[1/6] Upstream app already present — skipping copy"
fi

# ---- 2. Install Electron (compatible with remote API) ----
echo "[2/6] Installing Electron 13 (last version with remote API)..."
cd "$APP_DIR"
if ! command -v electron &>/dev/null || ! electron --version 2>/dev/null | grep -q "^v13"; then
    npm install --save-dev electron@13 --no-package-lock 2>/dev/null || true
fi

# ---- 3. Install deasync for imrsdk sync bridge ----
echo "[3/6] Installing deasync..."
npm install --prefix "$REPO/src/imrsdk" deasync --no-package-lock 2>/dev/null || true

# ---- 4. Replace Windows-only native modules ----
echo "[4/6] Replacing Windows-only native modules..."

# imrsdk: replace the Windows .node binding with Linux JS implementation
IMR_DEST="$APP_DIR/node_modules/imrsdk"
mkdir -p "$IMR_DEST"
cp "$REPO/src/imrsdk/index.js"               "$IMR_DEST/index.js"
cp "$REPO/src/imrsdk/amt-ider-standalone.js" "$IMR_DEST/amt-ider-standalone.js"
cp "$REPO/src/imrsdk/amt-redir-standalone.js" "$IMR_DEST/amt-redir-standalone.js"
cp "$REPO/src/imrsdk/package.json"           "$IMR_DEST/package.json"

# Copy deasync into imrsdk node_modules
if [ -d "$REPO/src/imrsdk/node_modules" ]; then
    mkdir -p "$IMR_DEST/node_modules"
    cp -r "$REPO/src/imrsdk/node_modules/." "$IMR_DEST/node_modules/"
fi

# krb-ticket: replace Windows Kerberos native binding with Linux stub
KRB_DEST="$APP_DIR/node_modules/krb-ticket"
mkdir -p "$KRB_DEST"
cp "$REPO/src/stubs/krb-ticket/index.js"      "$KRB_DEST/index.js"
cp "$REPO/src/stubs/krb-ticket/package.json"  "$KRB_DEST/package.json"

echo "      imrsdk  -> JS IDER engine (Apache 2.0)"
echo "      krb-ticket -> Linux stub (digest auth still works)"
echo "      winreg  -> already safe on Linux (try-catch in app)"

# ---- 5. Install remaining npm deps ----
echo "[5/6] Installing app dependencies (level, requirejs, winston)..."
cd "$APP_DIR"
# Remove Windows-specific packages from package.json for npm install
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
delete pkg.dependencies.imrsdk;
delete pkg.dependencies['krb-ticket'];
delete pkg.dependencies.winreg;
fs.writeFileSync('package.json.linux', JSON.stringify(pkg, null, 2));
" 2>/dev/null || true

npm install --prefix "$APP_DIR" level requirejs requirejs-text winston 2>/dev/null || true

# ---- 6. Patch main-electron.js for modern Electron ----
echo "[6/6] Patching main-electron.js for Electron 13..."
if ! grep -q "enableRemoteModule" "$APP_DIR/main-electron.js" 2>/dev/null; then
    # Enable remote module (removed in Electron 14, but Electron 13 needs explicit opt-in)
    sed -i 's/nodeIntegration: true,/nodeIntegration: true,\n            enableRemoteModule: true,/' \
        "$APP_DIR/main-electron.js" || true
    echo "      Patched: enableRemoteModule: true"
else
    echo "      Already patched"
fi

echo ""
echo "=== Setup complete ==="
echo "Run: ./scripts/run.sh"
