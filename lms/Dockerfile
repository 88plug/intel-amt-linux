FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Fetch pre-built LMS 2550 deb (Ubuntu 22.04) and let apt resolve all deps
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates dbus \
    && curl -fsSL \
       https://github.com/rgl/lms-binaries/releases/download/v0.0.20251226/lms-2550.0.0-ubuntu-22.04.deb \
       -o /tmp/lms.deb \
    && dpkg -i /tmp/lms.deb 2>/dev/null; apt-get install -f -y --no-install-recommends \
    && rm /tmp/lms.deb \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# LMS proxies /dev/mei0 → localhost:16992 (HTTP) and localhost:16993 (HTTPS/TLS)
EXPOSE 16992 16993

CMD ["/entrypoint.sh"]
