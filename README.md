# Localflix

![Localflix](localflix.png)

A lightweight self-hosted media library for movies and series. Store, view, and manage your personal video collection with a clean browser interface.

## Features

### Content Management
- **Movies** — Upload video files with automatic thumbnail generation and metadata storage
- **Series** — Organize episodes by season with per-episode thumbnails
- **Search** — Find content by title, author, tags, or description keywords
- **Delete** — Remove movies or entire series (with all episodes) from the UI

### Upload & Processing
- **Quality selection** — Choose output quality: Original, 1080p, 720p, or 480p
- **Audio track selection** — Pick which audio streams to keep (multi-language support)
- **Subtitle track selection** — Choose which embedded subtitle tracks to preserve (bitmap subs auto-filtered)
- **External subtitles** — Upload `.srt` files as sidecar subtitles (converted to WebVTT), either at upload time or added later from the video page — with an adjustable sync offset that never requires re-encoding
- **FFprobe analysis** — Video tracks are analyzed on upload for track selection
- **Automatic thumbnails** — Generated from a duration-aware timestamp (up to 20s in, or earlier for short clips), with a first-frame fallback
- **Series autocomplete** — Type-to-search when adding episodes to existing series

### Video Player
- **Seekable streaming** — HTTP range requests for smooth seeking and skipping
- **Custom controls** — Play/pause, skip ±10s, mute, fullscreen, clickable progress bar with hover preview
- **Audio track selector** — Switch between audio tracks in the player (Chromium-based browsers only — see Known Limitations)
- **Subtitle selector** — Choose between embedded subtitle tracks and sidecar (uploaded) subtitles, or turn off
- **Subtitle management** — Upload, delete, and adjust sync offset (±100ms/±500ms, or reset) for sidecar subtitles directly from the video page, without any re-processing
- **Download button** — Direct download link for the video file
- **Keyboard shortcuts** — Space (play/pause), ←/→ (skip ±10s), F (fullscreen), M (mute)

### UI/UX
- **Dark/Light mode** — Manual toggle with sun/moon icon, saved to localStorage, respects system preference
- **Text-based navigation** — Clean header with Localflix brand, Search, and Add Content links
- **Card-based add page** — Visual cards for Movie, Series, and Episode uploads
- **Modern SaaS dashboard** design with subtle animations and frosted glass header
- **Responsive grid layouts** — Adapts from 5 columns to 2 columns
- **Accessible** — Focus rings, semantic HTML, proper contrast

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 5 |
| Database | MySQL 8.3 |
| Video Processing | FFmpeg (fluent-ffmpeg) |
| Frontend | Vanilla HTML/CSS/JS (zero framework) |
| Containerization | Docker + Docker Compose |

## Quick Start (Docker)

The easiest way to run Localflix is with Docker Compose:

```bash
# Clone the repository
git clone https://github.com/svdecoder/Localflix.git
cd Localflix

# Configure environment — this .env goes in the project root, next to
# docker-compose.yml. It's a different file from data/mysql/.env (see the
# "Environment Variables" section below for why there are two).
cp .env.example .env
# Edit .env and set a secure MYSQL_ROOT_PASSWORD

# Start the stack
docker compose up -d

# Open http://localhost:3000
```

The database schema is automatically initialized on first run (including the `subtitles` table used for sidecar subtitles — see "Database Migrations" below if you're upgrading an existing install instead of starting fresh). Media files persist to the `data/` directory on your host via bind mounts.

## Manual Setup

### Prerequisites
- **Node.js** 18+
- **FFmpeg** (must be available in PATH)
- **MySQL** 8.0+ (or Docker for MySQL only)

### Installation

```bash
# Install dependencies
npm install

# Configure database
cd data/mysql
cp .env.example .env
# Edit .env — set MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, DATABASE, HOST
nano .env

# Start MySQL (if using Docker for DB only)
docker compose up -d
docker exec -it mysql_database mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS localflix;"
docker exec -i mysql_database mysql -u root -p localflix < schema.sql

# Start the application
cd ../..
node server.js
```

Open **http://localhost:3000** in your browser.

## Database Migrations

Localflix doesn't have a full migration runner — `data/mysql/schema.sql` is applied automatically on a fresh database, but existing installs need to apply new tables manually. Numbered, additive migration files live in `data/mysql/migrations/`; each one documents its own usage at the top and is safe to run against a database with existing data (they only add new tables/columns, never drop or modify existing ones).

Currently available:
- **`001_add_subtitles.sql`** — adds the `subtitles` table (sidecar subtitle files with adjustable sync offset). Needed if you're upgrading from a version of Localflix that predates this feature.

```bash
# Docker
docker compose exec db mysql -uroot -p localflix < data/mysql/migrations/001_add_subtitles.sql

# Manual / non-Docker MySQL
mysql -u root -p localflix < data/mysql/migrations/001_add_subtitles.sql
```

## Environment Variables

Localflix uses **two separate `.env` files**, depending on how you're running it — using the wrong one for your setup is a common source of "can't connect to database" errors:

| File | Used by | When |
|------|---------|------|
| `.env` (project root, from `.env.example`) | The root `docker-compose.yml` — both the `db` service (password substitution) and the `app` container (`env_file`) | **Quick Start (Docker)** — running the full stack with `docker compose up -d` |
| `data/mysql/.env` (from `data/mysql/.env.example`) | `data/mysql/docker-compose.yaml` (MySQL-only container) and `node server.js` directly | **Manual Setup** — running MySQL in Docker but the app with plain Node |

### Root `.env` (Docker Quick Start)

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_ROOT_PASSWORD` | MySQL root password — the app always connects as `root` | *(required)* |
| `MYSQL_DATABASE` | Database name | `localflix` |
| `HOST` | MySQL host as seen from inside the `app` container | `db` (must stay `db` — this is the Compose service name, not `localhost`) |

### `data/mysql/.env` (Manual Setup)

| Variable | Description | Default |
|----------|-------------|---------|
| `MYSQL_PASSWORD` | MySQL user password | *(required)* |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | *(required)* |
| `DATABASE` | Database name | `localflix` |
| `HOST` | MySQL host | `localhost` |

## Project Structure

```
Localflix/
├── server.js              # Express server entry point
├── package.json
├── Dockerfile             # Application container
├── docker-compose.yml     # Full stack orchestration
├── scripts/               # Backend business logic
│   ├── addMovie.js        # Movie upload & processing
│   ├── addEpisode.js      # Episode upload & processing
│   ├── addSerie.js        # Series creation
│   ├── subtitles.js       # Sidecar subtitle management (SRT→VTT, offset, CRUD)
│   ├── getDataMovie.js    # Movie data queries
│   ├── getDataSerie.js    # Series data queries
│   ├── getDataEpisodes.js # Episodes list queries
│   ├── getDataEpisode.js  # Single episode query
│   ├── index.js           # Homepage video list
│   ├── search.js          # Search functionality
│   └── videoProbe.js      # FFprobe track detection
├── public/                # Frontend
│   ├── css/styles.css     # Stylesheet (dark/light mode with CSS variables)
│   ├── js/                # Client-side JavaScript
│   └── html/              # HTML pages
├── data/                  # Persistent data (bind mounted)
│   ├── movies/            # Processed movie files
│   ├── serie/             # Episode files (by series)
│   ├── thumbnail/         # Auto-generated thumbnails
│   ├── uploads/           # Temporary upload staging
│   ├── subtitles/         # Sidecar subtitle files (.vtt, by movie/episode)
│   ├── images/            # UI images (logo, icons)
│   └── mysql/             # Database configuration
│       ├── .env           # Database credentials (Manual Setup path)
│       ├── schema.sql     # Database schema (applied automatically on fresh installs)
│       ├── migrations/    # Additive migrations for existing installs
│       └── docker-compose.yaml  # MySQL container
└── .dockerignore
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/newVideo` | Latest movies and series |
| GET | `/api/dataMovie?id=` | Movie metadata |
| GET | `/api/dataSerie?title=` | Series metadata |
| GET | `/api/dataEpisodes?title=&season=` | Episodes by season |
| GET | `/api/dataEpisode?id=` | Single episode metadata |
| GET | `/api/search?request=&specification=` | Search content |
| GET | `/api/videoTracks?path=` | Probe video audio/subtitle tracks |
| GET | `/api/searchSeries?q=` | Search series by partial title |
| GET | `/stream/movie/:id` | Stream movie (range requests) |
| GET | `/stream/serie/:serie/:id` | Stream episode (range requests) |
| POST | `/api/probeUpload` | Upload & probe video for track selection |
| POST | `/api/uploadSrt` | Stage an external `.srt` subtitle file (used both at upload time and by the sidecar subtitle endpoints below) |
| POST | `/api/subtitles` | Finalize a staged `.srt` into a persisted sidecar subtitle for a movie/episode |
| GET | `/api/subtitles?mediaType=&mediaId=` | List sidecar subtitles for a movie/episode |
| PATCH | `/api/subtitles/:id/offset` | Adjust a sidecar subtitle's sync offset (metadata only — no re-encode) |
| DELETE | `/api/subtitles/:id` | Delete a sidecar subtitle (file + DB row) |
| POST | `/add-movie` | Upload & process movie (multipart) |
| POST | `/add-serie` | Create series with thumbnail (multipart) |
| POST | `/add-episode` | Upload & process episode (multipart) |
| DELETE | `/api/movie/:id` | Delete movie (file + DB + its sidecar subtitles) |
| DELETE | `/api/episode/:id` | Delete a single episode (file + DB + its sidecar subtitles) |
| DELETE | `/api/serie/:title` | Delete series and all episodes (files + DB + their sidecar subtitles) |

## Keyboard Shortcuts (Video Player)

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Skip back 10 seconds |
| `→` | Skip forward 10 seconds |
| `F` | Toggle fullscreen |
| `M` | Mute / Unmute |

## Security

This application is designed for **trusted local/private networks** and intentionally has no authentication.

Security measures implemented:
- All SQL queries use parameterized statements (no SQL injection)
- Column name whitelisting in search queries
- Path traversal protection on all file operations
- Input sanitization on all user-provided data
- HTML escaping to prevent XSS
- No stack traces leaked to the UI
- No secrets exposed to the client

## Known Limitations

- **Audio track switching** in the player uses the `HTMLMediaElement.audioTracks` API, which only Chromium-based browsers (Chrome, Edge, Opera) implement. Firefox and Safari have no client-side way to switch between multiple audio tracks embedded in a video, so the audio selector is disabled on those browsers with an explanatory tooltip rather than silently doing nothing.
- **No migration runner** — `data/mysql/migrations/` is a plain folder of numbered, manually-applied SQL files, not an automated system. See "Database Migrations" above.
- **No automated test suite** exists for this project yet.

## License

MIT License — see [LICENSE](LICENSE) for details.