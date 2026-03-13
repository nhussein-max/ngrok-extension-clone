FROM --platform=linux/amd64 base_image:latest

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
  --no-install-recommends && rm -rf /var/lib/apt/lists/*


WORKDIR /testbed
RUN chmod -R 777 /testbed
RUN git clone https://github.com/nhussein-max/battleship . && git reset --hard 5542c0d1f7fbd2aafa3944c7f8682e69cad8d82d && git remote remove origin

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install -r requirements.txt

RUN echo "source /opt/venv/bin/activate" >> /root/.bashrc