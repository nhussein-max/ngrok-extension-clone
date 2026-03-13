FROM node:24.14.0-trixie-slim

RUN apt-get update && apt-get install -y \
  ca-certificates \
  curl \
  python3 \
  git \
  build-essential \
  bash \
  sudo \
  ripgrep \
  vim \
  unzip \
  bubblewrap \
  procps \
  iproute2 \
  python3-pip \
  python3-venv \
  podman \
  slirp4netns \   
  passt \     
  iptables \   
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

