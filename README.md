# anton

A voice-capable Discord music bot built with Bun and TypeScript, utilizing `ffmpeg` and `yt-dlp`.

## Setup

1. Copy the template environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your Discord Bot Token and API credentials:
   - `TOKEN`: Your Discord bot token.
   - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: Optional Spotify metadata credentials. Both must be provided to enable Spotify URLs.
   - `SOUNDCLOUD_CLIENT_ID`: Optional SoundCloud client ID.
   - `GENIUS_ACCESS_TOKEN`: Optional Genius access token (used for looking up lyrics).
   - `MAX_PLAYLIST_TRACKS`: Maximum tracks accepted from one playlist. Defaults to `100`.
   - `MAX_QUEUE_TRACKS`: Maximum tracks stored per guild. Defaults to `200`.
   - `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`. Defaults to `info`.
   - `LOG_PRETTY`: Enables readable development logs. Defaults to `false`.

---

## Running with Docker

This application has been dockerized with a multi-stage build that installs runtime dependencies (`ffmpeg`, `python3`, `yt-dlp`) and compiles the source code into a standalone binary using Bun.

### 1. Build the Docker Image

Run the following command to build the image:
```bash
docker build -t anton-bot .
```

### 2. Run the Container

Start the bot in the background using the container name `anton-bot` and linking your `.env` file:
```bash
docker run -d --name anton-bot --env-file .env anton-bot
```

> [!NOTE]
> The container defaults to running `./build/main --register` on startup. This compiles the code, logs in, and automatically refreshes/registers the Discord Slash commands.

### Useful Commands

- **View Logs**:
  ```bash
  docker logs -f anton-bot
  ```
- **Stop the Bot**:
  ```bash
  docker stop anton-bot
  ```
- **Start the Bot**:
  ```bash
  docker start anton-bot
  ```
- **Remove the Container**:
  ```bash
  docker rm anton-bot
  ```

---

## Local Development (Without Docker)

### Install Dependencies
```bash
bun install
```

### Run in Dev Mode (with Hot Reloading)
```bash
bun run dev
```

### Build/Compile the Application
```bash
bun run build
```

### Run the Compiled Binary
```bash
./build/main
```
Or to run with command registration:
```bash
./build/main --register
```
