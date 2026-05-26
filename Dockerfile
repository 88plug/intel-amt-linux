FROM node:18-bookworm-slim

# Electron runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxss1 \
    xvfb \
    x11vnc \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /imc

# Electron 13
COPY package.json package-lock.json* ./
RUN npm install --no-audit 2>/dev/null || true

# App and Linux replacements
COPY upstream/app /imc/app
COPY src/imrsdk /imc/app/node_modules/imrsdk
COPY src/stubs/krb-ticket /imc/app/node_modules/krb-ticket

RUN npm install --prefix /imc/app deasync --no-save --no-audit 2>/dev/null || true

COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5900

ENV ELECTRON_NO_SANDBOX=1

ENTRYPOINT ["/entrypoint.sh"]
