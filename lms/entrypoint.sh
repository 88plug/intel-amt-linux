#!/bin/sh
# Start system D-Bus (LMS registers its service interfaces over D-Bus)
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true
sleep 1
exec /usr/bin/lms
