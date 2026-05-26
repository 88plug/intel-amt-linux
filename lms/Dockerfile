FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git python3 python3-pip \
    libxml2-dev libglib2.0-dev libssl-dev \
    libace-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth=1 https://github.com/intel/lms.git .

RUN cmake -S . -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_WIN_UNIVERSAL_APP=OFF \
    -DIGNOREDLL_DEPENDENCIES=OFF \
    && cmake --build build -j"$(nproc)" \
    && cmake --install build --prefix /usr/local

# LMS proxies /dev/mei0 → localhost:16992 (HTTP) and localhost:16993 (HTTPS)
EXPOSE 16992 16993

CMD ["/usr/local/bin/lms"]
