#!/usr/bin/env bash
set -euo pipefail

ELECTRON=/imc/node_modules/.bin/electron

# If caller forwarded an X display (docker run -e DISPLAY -v /tmp/.X11-unix), use it.
# Otherwise start Xvfb + VNC so the GUI is reachable on :5900.
if [ -n "${DISPLAY:-}" ] && [ -e "/tmp/.X11-unix/X${DISPLAY#:}" ] 2>/dev/null; then
    echo "Using host X11 display $DISPLAY"
    exec "$ELECTRON" /imc/app --no-sandbox
else
    echo "No host display — starting Xvfb on :99 + VNC on :5900"
    Xvfb :99 -screen 0 1280x800x24 -ac &
    XVFB_PID=$!
    sleep 1
    DISPLAY=:99 x11vnc -display :99 -nopw -listen 0.0.0.0 -port 5900 -bg -quiet || true
    DISPLAY=:99 exec "$ELECTRON" /imc/app --no-sandbox
fi
