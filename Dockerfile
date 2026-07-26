FROM oven/bun:1 AS builder
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
ARG TARGETARCH
RUN if [ "$TARGETARCH" = arm64 ]; then \
      CFLAGS="-DOPUS_ARM_MAY_HAVE_NEON_INTR=1 -DOPUS_ARM_MAY_HAVE_NEON=1" bun install --frozen-lockfile; \
    else \
      bun install --frozen-lockfile; \
    fi
COPY . .
RUN bun run build
RUN case "$TARGETARCH" in \
      arm64) YTDLP_ASSET=yt-dlp_linux_aarch64 ;; \
      amd64) YTDLP_ASSET=yt-dlp_linux ;; \
      *) echo "Unsupported yt-dlp architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP_ASSET" -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

FROM oven/bun:1-slim AS runner
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

CMD ["./build/main", "--register"]
