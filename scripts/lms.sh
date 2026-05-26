#!/usr/bin/env bash
# Intel LMS (Local Manageability Service) — runs in Docker, proxies /dev/mei0
# to localhost:16992 (HTTP AMT) and localhost:16993 (HTTPS AMT).
# After this runs, IMC and other tools can reach AMT on localhost.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -e /dev/mei0 ]; then
    echo "ERROR: /dev/mei0 not found — Intel MEI driver not loaded or no AMT hardware"
    exit 1
fi

CMD="${1:-start}"

case "$CMD" in
    build)
        echo "Building Intel LMS Docker image (first time takes ~5 min)..."
        docker build -t intel-lms "$REPO/lms"
        echo "Built: intel-lms"
        ;;
    start)
        if docker ps --format '{{.Names}}' | grep -q '^intel-lms$'; then
            echo "LMS already running"
            exit 0
        fi
        if ! docker image inspect intel-lms &>/dev/null; then
            echo "LMS image not built. Run: bash scripts/lms.sh build"
            exit 1
        fi
        echo "Starting Intel LMS (AMT proxy on localhost:16992/16993)..."
        docker run -d --rm \
            --name intel-lms \
            --device /dev/mei0:/dev/mei0 \
            -p 127.0.0.1:16992:16992 \
            -p 127.0.0.1:16993:16993 \
            intel-lms
        sleep 2
        # Verify it's proxying
        if timeout 2 bash -c "echo > /dev/tcp/127.0.0.1/16992" 2>/dev/null; then
            echo "LMS running — AMT reachable on localhost:16992/16993"
        else
            echo "LMS started but port not yet open — give it a moment"
        fi
        ;;
    stop)
        docker stop intel-lms 2>/dev/null && echo "LMS stopped" || echo "LMS not running"
        ;;
    status)
        if docker ps --format '{{.Names}}' | grep -q '^intel-lms$'; then
            echo "LMS running"
            timeout 2 bash -c "echo > /dev/tcp/127.0.0.1/16992" 2>/dev/null && echo "  port 16992 reachable" || echo "  port 16992 not ready"
        else
            echo "LMS not running"
        fi
        ;;
    *)
        echo "Usage: $0 {build|start|stop|status}"
        exit 1
        ;;
esac
