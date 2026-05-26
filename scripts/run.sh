#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO/upstream/app"
ELECTRON="$REPO/node_modules/.bin/electron"

if [ ! -d "$APP_DIR/script" ]; then
    echo "App not set up. Run scripts/setup.sh first."
    exit 1
fi

if [ ! -x "$ELECTRON" ]; then
    echo "Electron not found at $ELECTRON. Run: npm install"
    exit 1
fi

MODE="${1:-native}"

case "$MODE" in
    docker)
        echo "Building and launching IMC in Docker..."
        docker build -t imc-linux "$REPO"
        docker run --rm -it \
            --network host \
            -e DISPLAY="${DISPLAY:-:0}" \
            -v /tmp/.X11-unix:/tmp/.X11-unix \
            -v "${XAUTHORITY:-$HOME/.Xauthority}:/root/.Xauthority:ro" \
            imc-linux
        ;;
    docker-xvfb)
        echo "Launching IMC in Docker with Xvfb (headless, attach VNC)..."
        docker build -t imc-linux "$REPO"
        docker run --rm -it \
            --network host \
            -p 5900:5900 \
            imc-linux-xvfb
        ;;
    native|*)
        echo "Launching Intel Manageability Commander (native Linux)..."
        exec "$ELECTRON" "$APP_DIR" --no-sandbox
        ;;
esac
