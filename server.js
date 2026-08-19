import express from "express";
import multer from "multer";
const upload = multer({ dest: "data/uploads" });

import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import addMovieHandler from "./scripts/addMovie.js";
import vidIdentifiers from "./scripts/index.js";
import getDataMovie from "./scripts/getDataMovie.js";
import getCatalogue from "./scripts/getCatalogue.js";
import getDataSeries from "./scripts/getDataSerie.js";
import getDataEpisodes from "./scripts/getDataEpisodes.js";
import getDataEpisode from "./scripts/getDataEpisode.js";
import search from "./scripts/search.js";
import addSerie from "./scripts/addSerie.js";
import addEpisodeHandler from "./scripts/addEpisode.js";
import updateMovie from "./scripts/updateMovie.js";
import updateEpisode from "./scripts/updateEpisode.js";
import { getVideoTracks } from "./scripts/videoProbe.js";
import dbConfig from "./scripts/dbConfig.js";
import { createConnection } from "./scripts/dbConnection.js";
import getStats from "./scripts/getStats.js";
import wipeData from "./scripts/wipeData.js";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { getJobPublic, subscribe, getRunningJobs } from "./scripts/jobManager.js";
import { restartJob, cancelJob } from "./scripts/ffmpegJob.js";
import { getFfmpegConfig, FFMPEG_CONFIG_PATH, DEFAULT_FFMPEG_CONFIG } from "./scripts/ffmpegConfig.js";
import { addSubtitle, getSubtitles, getSubtitleById, deleteSubtitle, updateSubtitleOffset, deleteSubtitlesForMedia } from "./scripts/subtitles.js";

const app = express();
const PORT = 3000;

// Middleware MUST be registered before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Video streaming with range request support (enables seeking)
function streamVideo(req, res, filePath) {
  const normalized = path.normalize(filePath);
  if (normalized.includes("..")) {
    console.error(`[Stream] Path traversal blocked: ${filePath}`);
    res.status(403).json({ error: "Forbidden", id: path.basename(filePath, ".mp4") });
    return;
  }
  const fullPath = path.join(__dirname, normalized);

  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch (_) {
    console.error(`[Stream] File not found: ${fullPath}`);
    res.status(404).json({ error: "Video file not found", id: path.basename(filePath, ".mp4") });
    return;
  }

  if (stat.size === 0) {
    console.error(`[Stream] File is empty: ${fullPath}`);
    res.status(500).json({ error: "Video file is empty", id: path.basename(filePath, ".mp4") });
    return;
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  console.log(`[Stream] Serving: ${fullPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const stream = fs.createReadStream(fullPath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(fullPath).pipe(res);
  }
}

// Streaming routes (must be before static middleware for these paths)
app.get("/stream/movie/:id", (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  streamVideo(req, res, `data/movies/${id}.mp4`);
});

app.get("/stream/serie/:serie/:id", (req, res) => {
  const serie = String(req.params.serie).replace(/[^A-Za-z0-9._\-]/g, "");
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  streamVideo(req, res, `data/serie/${serie}/${id}.mp4`);
});

// Static file serving
app.use("/data/thumbnail", express.static(path.join(__dirname, "data/thumbnail")));
app.use("/data/serie", express.static(path.join(__dirname, "data/serie")));
app.use("/data/subtitles", express.static(path.join(__dirname, "data/subtitles")));
app.use("/api/images", express.static(path.join(__dirname, "data/images")));
app.use("/js", express.static(path.join(__dirname, "public/js")));
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use("/favicon.ico", express.static(path.join(__dirname, "data/images/icon.ico")));

// API Routes
app.get("/api/newVideo", async (req, res) => {
  const numberOfVIdeoToDisplay = 5;
  try {
    const identifiers = await vidIdentifiers(numberOfVIdeoToDisplay);
    res.json(identifiers);
  } catch (err) {
    console.error("Error fetching new videos:", err);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

app.get("/api/catalogue", async (req, res) => {
  try {
    const movies = await getCatalogue();
    res.json(movies);
  } catch (err) {
    console.error("Error fetching catalogue:", err);
    res.status(500).json({ error: "Failed to fetch catalogue" });
  }
});

app.get("/api/dataMovie", async (req, res) => {
  const identifier = req.query.id;
  if (!identifier) return res.status(400).json({ error: "Missing id parameter" });
  try {
    const datas = await getDataMovie(identifier);
    res.json(datas);
  } catch (err) {
    console.error("Error fetching movie data:", err);
    res.status(500).json({ error: "Failed to fetch movie data" });
  }
});

// Delete a movie by identifier
app.delete("/api/movie/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  if (!id) return res.status(400).json({ error: "Invalid movie ID" });

  const moviePath = path.join(__dirname, "data", "movies", `${id}.mp4`);
  const thumbnailPath = path.join(__dirname, "data", "thumbnail", `${id}.jpg`);

  try {
    try { fs.unlinkSync(moviePath); } catch (_) {}
    try { fs.unlinkSync(thumbnailPath); } catch (_) {}
    try { await deleteSubtitlesForMedia("movie", id); } catch (_) {}

    const con = createConnection();

    await new Promise((resolve, reject) => {
      con.connect((err) => {
        if (err) { con.end(); return reject(err); }
        con.query("DELETE FROM movie WHERE identifier = ?", [id], (err, result) => {
          con.end();
          if (err) return reject(err);
          resolve(result);
        });
      });
    });

    console.log(`[Delete] Movie deleted: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting movie:", err);
    res.status(500).json({ error: "Failed to delete movie" });
  }
});

app.get("/api/dataEpisode", async (req, res) => {
  const identifier = req.query.id;
  if (!identifier) return res.status(400).json({ error: "Missing id parameter" });
  try {
    const datas = await getDataEpisode(identifier);
    res.json(datas);
  } catch (err) {
    console.error("Error fetching episode data:", err);
    res.status(500).json({ error: "Failed to fetch episode data" });
  }
});

// Update a movie's metadata
app.put("/api/movie/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  if (!id) return res.status(400).json({ error: "Invalid movie ID" });

  const { title, author, description, release_date, tags } = req.body || {};
  if (!title && !author && !description && !release_date && !tags) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    await updateMovie(id, { title, author, description, release_date, tags });
    console.log(`[Update] Movie updated: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating movie:", err);
    res.status(500).json({ error: "Failed to update movie" });
  }
});

// Update an episode's metadata
app.put("/api/episode/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  if (!id) return res.status(400).json({ error: "Invalid episode ID" });

  const { title, description, date, episode, season } = req.body || {};
  if (!title && !description && !date && !episode && !season) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    await updateEpisode(id, { title, description, date, episode, season });
    console.log(`[Update] Episode updated: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating episode:", err);
    res.status(500).json({ error: "Failed to update episode" });
  }
});

// Search series by partial title (for autocomplete)
app.get("/api/searchSeries", async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 1) return res.json([]);
  try {
    const con = createConnection();

    const results = await new Promise((resolve, reject) => {
      con.connect((err) => {
        if (err) { con.end(); return reject(err); }
        con.query(
          "SELECT title, number_of_seasons, author FROM series WHERE title LIKE ? ORDER BY title LIMIT 10",
          [`${q}%`],
          (err, rows) => {
            con.end();
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });
    });
    res.json(results);
  } catch (err) {
    console.error("Error searching series:", err);
    res.status(500).json({ error: "Failed to search series" });
  }
});

app.get("/api/dataSerie", async (req, res) => {
  const title = req.query.title;
  if (!title) return res.status(400).json({ error: "Missing title parameter" });
  try {
    const datas = await getDataSeries(title);
    res.json(datas);
  } catch (err) {
    console.error("Error fetching series data:", err);
    res.status(500).json({ error: "Failed to fetch series data" });
  }
});

// Delete a series and all its episodes
app.delete("/api/serie/:title", async (req, res) => {
  const title = String(req.params.title).replace(/[^A-Za-z0-9._\- ]+/g, "");
  if (!title) return res.status(400).json({ error: "Invalid series title" });

  const serieFolder = path.join(__dirname, "data", "serie", title);
  const thumbnailPath = path.join(__dirname, "data", "thumbnail", `${title.replace(/\s+/g, "")}.jpg`);

  try {
    try { fs.rmSync(serieFolder, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(thumbnailPath); } catch (_) {}

    const con = createConnection();

    // Grab the episode identifiers first — subtitle rows key on the episode's
    // identifier, not the series title, so we need this list to clean up
    // their sidecar subtitles after the DB delete cascades.
    const episodeIds = await new Promise((resolve, reject) => {
      con.connect((err) => {
        if (err) { con.end(); return reject(err); }
        con.query("SELECT identifier FROM episodes WHERE serie_id = ?", [title], (err, rows) => {
          if (err) { con.end(); return reject(err); }
          resolve(rows.map((r) => r.identifier));
        });
      });
    });

    await new Promise((resolve, reject) => {
      con.query("DELETE FROM episodes WHERE serie_id = ?", [title], (err) => {
        if (err) { con.end(); return reject(err); }
        con.query("DELETE FROM series WHERE title = ?", [title], (err, result) => {
          con.end();
          if (err) return reject(err);
          resolve(result);
        });
      });
    });

    for (const episodeId of episodeIds) {
      try { await deleteSubtitlesForMedia("episode", episodeId); } catch (_) {}
    }

    console.log(`[Delete] Series deleted: ${title}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting series:", err);
    res.status(500).json({ error: "Failed to delete series" });
  }
});

app.get("/api/dataEpisodes", async (req, res) => {
  const title = req.query.title;
  const season = req.query.season;
  if (!title || !season) return res.status(400).json({ error: "Missing title or season parameter" });
  try {
    const datas = await getDataEpisodes(title, season);
    res.json(datas);
  } catch (err) {
    console.error("Error fetching episodes:", err);
    res.status(500).json({ error: "Failed to fetch episodes" });
  }
});

app.get("/api/search", async (req, res) => {
  const request = req.query.request;
  const specification = req.query.specification;
  if (!request || !specification) return res.status(400).json({ error: "Missing parameters" });
  try {
    const datas = await search(request, specification);
    res.json(datas);
  } catch (err) {
    console.error("Error searching:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// Video tracks probe endpoint (for already-processed files)
app.get("/api/videoTracks", async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "Missing path parameter" });
  const normalized = path.normalize(filePath);
  if (normalized.includes("..")) return res.status(403).json({ error: "Invalid path" });
  const fullPath = path.join(__dirname, normalized);
  try {
    const tracks = await getVideoTracks(fullPath);
    res.json(tracks);
  } catch (err) {
    console.error("Error probing video:", err);
    res.status(500).json({ error: "Failed to probe video" });
  }
});

// Subtitle extraction endpoint (serves embedded subtitles as WebVTT for <track> elements)
app.get("/api/subtitle", async (req, res) => {
  const filePath = req.query.path;
  const index = parseInt(req.query.index, 10);
  if (!filePath || isNaN(index)) {
    return res.status(400).json({ error: "Missing path or index parameter" });
  }

  const normalized = path.normalize(filePath);
  if (normalized.includes("..")) {
    return res.status(403).json({ error: "Invalid path" });
  }
  const fullPath = path.join(__dirname, normalized);

  try {
    const tracks = await getVideoTracks(fullPath);
    const relIdx = tracks.subtitles.findIndex((s) => s.index === index);
    if (relIdx < 0) {
      return res.status(404).json({ error: "Subtitle track not found" });
    }

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    // Extract the subtitle as WebVTT, then transform the stream to:
    //   1. Inject `line:85%` into every cue so subtitles render higher
    //      on the video (like VLC) — this is the cross-browser reliable
    //      way to position cues (CSS `::cue { line: ... }` is not supported).
    //   2. Ensure the output starts with a proper WEBVTT header.
    const ffmpegProc = ffmpeg(fullPath)
      .outputOptions(["-map", `0:s:${relIdx}`, "-f", "webvtt"])
      .on("error", (err) => {
        console.error("[Subtitle] Extraction error:", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to extract subtitle" });
        } else {
          res.end();
        }
      });

    let firstChunk = true;
    ffmpegProc.pipe(
      new (await import("stream")).Transform({
        transform(chunk, _enc, callback) {
          let text = chunk.toString("utf8");

          // On the first chunk, strip any BOM and ensure the WEBVTT header
          if (firstChunk) {
            firstChunk = false;
            text = text.replace(/^\uFEFF/, "");
            if (!text.startsWith("WEBVTT")) {
              text = "WEBVTT\n\n" + text;
            }
          }

          // Inject `line:85%` into every cue timing line that doesn't
          // already have a line/position setting.
          text = text.replace(
            /^(\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3})(?!.*\bline:)(.*)$/gm,
            "$1 line:85%$2"
          );

          callback(null, Buffer.from(text, "utf8"));
        },
      }),
      { end: true }
    ).pipe(res);
  } catch (err) {
    console.error("[Subtitle] Extraction error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to extract subtitle" });
    }
  }
});

// ===== Job Management API =====
// Track ffmpeg conversion jobs with live logs, progress, restart and cancel

// Get job status + logs
app.get("/api/job/:id", (req, res) => {
  const job = getJobPublic(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// Restart a failed/stalled/cancelled job
app.post("/api/job/:id/restart", async (req, res) => {
  try {
    const job = await restartJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(getJobPublic(job.id));
  } catch (err) {
    console.error("Error restarting job:", err);
    res.status(500).json({ error: "Failed to restart job" });
  }
});

// Cancel a running job
app.post("/api/job/:id/cancel", (req, res) => {
  const job = cancelJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(getJobPublic(job.id));
});

// SSE stream for live job logs + progress
app.get("/api/job/:id/stream", (req, res) => {
  const job = getJobPublic(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: "snapshot", job })}\n\n`);

  const unsubscribe = subscribe(job.id, {
    onLog: (line) => {
      res.write(`data: ${JSON.stringify({ type: "log", line })}\n\n`);
    },
    onStatus: (status) => {
      res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
    },
    onProgress: (progress) => {
      res.write(`data: ${JSON.stringify({ type: "progress", progress })}\n\n`);
    },
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

// ===== Chunked Upload System =====
// Solves Cloudflare 100MB limit by splitting uploads into 25MB chunks

// Check upload status — which chunks have already been received (for resume)
app.get("/api/uploadStatus", (req, res) => {
  const uploadId = String(req.query.uploadId || "").replace(/[^A-Za-z0-9._\-]/g, "");
  if (!uploadId) return res.status(400).json({ error: "Missing uploadId" });

  const chunkDir = path.join(__dirname, "data", "uploads", uploadId);
  if (!fs.existsSync(chunkDir)) {
    return res.json({ receivedChunks: [], totalChunks: 0 });
  }

  try {
    const chunkFiles = fs.readdirSync(chunkDir)
      .filter(f => f.startsWith("chunk_"))
      .sort();
    const receivedChunks = chunkFiles.map(f => parseInt(f.replace("chunk_", ""), 10));
    res.json({ receivedChunks, totalChunks: receivedChunks.length });
  } catch (err) {
    console.error("Error checking upload status:", err);
    res.status(500).json({ error: "Failed to check upload status" });
  }
});

// Receive a single chunk (raw binary, 25MB max)
app.post("/api/chunkUpload", express.raw({ type: "application/octet-stream", limit: "30mb" }), (req, res) => {
  const uploadId = String(req.headers["x-upload-id"] || "").replace(/[^A-Za-z0-9._\-]/g, "");
  const chunkIndex = parseInt(req.headers["x-chunk-index"], 10);
  const totalChunks = parseInt(req.headers["x-total-chunks"], 10);
  const originalName = req.headers["x-original-name"] || "video";

  if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks)) {
    return res.status(400).json({ error: "Missing chunk headers: x-upload-id, x-chunk-index, x-total-chunks" });
  }

  const chunkDir = path.join(__dirname, "data", "uploads", uploadId);
  try { fs.mkdirSync(chunkDir, { recursive: true }); } catch (_) {}

  const chunkPath = path.join(chunkDir, `chunk_${String(chunkIndex).padStart(6, "0")}`);
  try {
    fs.writeFileSync(chunkPath, req.body);
    console.log(`[Chunk] Received ${uploadId} chunk ${chunkIndex + 1}/${totalChunks} (${(req.body.length / 1024 / 1024).toFixed(1)} MB)`);
    res.json({ ok: true, chunk: chunkIndex, received: req.body.length });
  } catch (err) {
    console.error("Error writing chunk:", err);
    res.status(500).json({ error: "Failed to write chunk" });
  }
});

// Assemble all chunks into final file, then probe it
app.post("/api/chunkAssemble", express.json(), async (req, res) => {
  const uploadId = String(req.body.uploadId || "").replace(/[^A-Za-z0-9._\-]/g, "");
  const originalName = req.body.originalName;
  if (!uploadId) return res.status(400).json({ error: "Missing uploadId" });

  const chunkDir = path.join(__dirname, "data", "uploads", uploadId);
  if (!fs.existsSync(chunkDir)) {
    return res.status(404).json({ error: "No chunks found for this upload ID" });
  }

  // Use a temp path for assembly to avoid name collision with chunk dir
  const stagedName = uploadId;
  const destPath = path.join(__dirname, "data", "uploads", stagedName);

  try {
    // Read all chunks sorted by index
    const chunkFiles = fs.readdirSync(chunkDir)
      .filter(f => f.startsWith("chunk_"))
      .sort();

    if (chunkFiles.length === 0) {
      return res.status(400).json({ error: "No chunks to assemble" });
    }

    // Write to a temp file first (avoids EISDIR collision with chunk dir)
    const tmpPath = destPath + ".assembling";
    const fd = fs.openSync(tmpPath, "w");
    for (const chunkFile of chunkFiles) {
      const data = fs.readFileSync(path.join(chunkDir, chunkFile));
      fs.writeSync(fd, data);
    }
    fs.closeSync(fd);

    // Clean up chunk directory, then rename temp to final path
    try { fs.rmSync(chunkDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.renameSync(tmpPath, destPath); } catch (_) {}

    const fileSize = fs.statSync(destPath).size;
    console.log(`[Chunk] Assembled ${uploadId}: ${(fileSize / 1024 / 1024).toFixed(1)} MB from ${chunkFiles.length} chunks`);

    // Probe the assembled file
    try {
      const tracks = await getVideoTracks(destPath);
      res.json({
        stagedFile: stagedName,
        tracks,
        size: fileSize,
      });
    } catch (probeErr) {
      console.error("Error probing assembled file:", probeErr);
      try { fs.unlinkSync(destPath); } catch (_) {}
      res.status(500).json({ error: "Failed to probe video file. Ensure FFmpeg is installed." });
    }
  } catch (err) {
    console.error("Error assembling chunks:", err);
    try { fs.unlinkSync(destPath); } catch (_) {}
    res.status(500).json({ error: "Failed to assemble chunks" });
  }
});

// SRT subtitle upload endpoint
const srtUpload = multer({
  dest: "data/uploads",
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".srt")) {
      cb(null, true);
    } else {
      cb(new Error("Only .srt subtitle files are accepted"));
    }
  },
});
app.post("/api/uploadSrt", srtUpload.single("srt"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No SRT file uploaded" });
  try {
    const content = fs.readFileSync(req.file.path, "utf-8").slice(0, 200);
    if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(content)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "File does not appear to be a valid SRT subtitle file" });
    }
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: "Failed to validate SRT file" });
  }
  res.json({
    srtFile: req.file.filename,
    originalName: req.file.originalname,
  });
});

// ===== Sidecar Subtitle API =====
// These operate on the `subtitles` table (WebVTT sidecar files with an
// adjustable offset), separate from subtitle tracks muxed into a video's
// container (which are handled via /api/videoTracks and /api/subtitle).

const VALID_MEDIA_TYPES = ["movie", "episode"];

// Verify the referenced movie/episode actually exists before attaching a
// subtitle to it — mediaId is already sanitized against path traversal
// downstream, but this additionally prevents orphan subtitle rows/files
// pointing at media that was never created (or was already deleted).
async function mediaExists(mediaType, mediaId) {
  if (mediaType === "movie") {
    const rows = await getDataMovie(mediaId);
    return rows && rows.length > 0;
  }
  if (mediaType === "episode") {
    const rows = await getDataEpisode(mediaId);
    return rows && rows.length > 0;
  }
  return false;
}

// Finalize a previously staged .srt (via /api/uploadSrt) into a persisted
// sidecar subtitle for a specific movie/episode. Used for the "add subtitle
// after upload" flow from the viewer pages.
app.post("/api/subtitles", async (req, res) => {
  const { mediaType, mediaId, language, srtFile, originalName } = req.body || {};

  if (!VALID_MEDIA_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'episode'" });
  }
  const safeMediaId = String(mediaId || "").replace(/[^A-Za-z0-9._\- ]+/g, "");
  if (!safeMediaId) return res.status(400).json({ error: "mediaId is required" });
  const safeSrtFile = String(srtFile || "").replace(/[^A-Za-z0-9._\-]/g, "");
  if (!safeSrtFile) return res.status(400).json({ error: "srtFile is required (upload via /api/uploadSrt first)" });

  try {
    if (!(await mediaExists(mediaType, safeMediaId))) {
      return res.status(404).json({ error: `No ${mediaType} found with that ID` });
    }

    const srtPath = path.join(__dirname, "data", "uploads", safeSrtFile);
    if (!fs.existsSync(srtPath)) {
      return res.status(400).json({ error: "Staged subtitle file not found — please re-upload it" });
    }

    const subtitle = await addSubtitle({
      mediaType,
      mediaId: safeMediaId,
      language,
      originalFilename: originalName || safeSrtFile,
      srtPath,
    });

    try { fs.unlinkSync(srtPath); } catch (_) {}

    res.json(subtitle);
  } catch (err) {
    console.error("Error adding subtitle:", err);
    res.status(500).json({ error: "Failed to add subtitle" });
  }
});

// List sidecar subtitles for a movie/episode
app.get("/api/subtitles", async (req, res) => {
  const { mediaType, mediaId } = req.query;
  if (!VALID_MEDIA_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'episode'" });
  }
  const safeMediaId = String(mediaId || "").replace(/[^A-Za-z0-9._\- ]+/g, "");
  if (!safeMediaId) return res.status(400).json({ error: "mediaId is required" });

  try {
    const subtitles = await getSubtitles(mediaType, safeMediaId);
    res.json(subtitles);
  } catch (err) {
    console.error("Error listing subtitles:", err);
    res.status(500).json({ error: "Failed to list subtitles" });
  }
});

// Adjust a subtitle's sync offset (metadata only — no re-encode, no file rewrite)
app.patch("/api/subtitles/:id/offset", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid subtitle ID" });
  const { offsetMs } = req.body || {};
  if (offsetMs === undefined || isNaN(parseInt(offsetMs, 10))) {
    return res.status(400).json({ error: "offsetMs (number, milliseconds) is required" });
  }

  try {
    const updated = await updateSubtitleOffset(id, offsetMs);
    res.json(updated);
  } catch (err) {
    console.error("Error updating subtitle offset:", err);
    const status = err.message === "Subtitle not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Failed to update subtitle offset" });
  }
});

// Delete a sidecar subtitle
app.delete("/api/subtitles/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid subtitle ID" });

  try {
    await deleteSubtitle(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting subtitle:", err);
    const status = err.message === "Subtitle not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Failed to delete subtitle" });
  }
});

// ===== Config / Stats / Wipe API =====
// FFMPEG_CONFIG_PATH / DEFAULT_FFMPEG_CONFIG are imported from
// scripts/ffmpegConfig.js (single source of truth), rather than duplicated
// here — this used to be a second hand-copied definition that had to be
// kept manually in sync with the one the actual encoder uses.
function readFfmpegConfig() {
  return getFfmpegConfig();
}

// Get library stats
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Wipe content
app.post("/api/wipe", async (req, res) => {
  const { target } = req.body || {};
  if (!target || !["movies", "series", "uploads", "all"].includes(target)) {
    return res.status(400).json({ error: "Invalid wipe target" });
  }

  // Wiping "uploads" (or "all", which includes uploads) deletes everything
  // under data/uploads — including the staged input file of any job that's
  // actively encoding right now. Block it instead of letting ffmpeg's input
  // disappear out from under it mid-run.
  if (target === "uploads" || target === "all") {
    const runningJobs = getRunningJobs();
    if (runningJobs.length > 0) {
      return res.status(409).json({
        error: `Cannot wipe uploads while ${runningJobs.length} job(s) are still processing. Wait for them to finish or cancel them first.`,
      });
    }
  }

  try {
    const result = await wipeData(target);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Error wiping data:", err);
    res.status(500).json({ error: "Failed to wipe data" });
  }
});

// Get ffmpeg config
app.get("/api/ffmpegConfig", (req, res) => {
  res.json(readFfmpegConfig());
});

// Save ffmpeg config
app.put("/api/ffmpegConfig", (req, res) => {
  const { encoding, presets } = req.body || {};
  if (!encoding || !presets) {
    return res.status(400).json({ error: "Missing encoding or presets" });
  }
  try {
    const config = { encoding, presets };
    fs.writeFileSync(FFMPEG_CONFIG_PATH, JSON.stringify(config, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving ffmpeg config:", err);
    res.status(500).json({ error: "Failed to save ffmpeg config" });
  }
});

// Reset ffmpeg config to defaults
app.post("/api/ffmpegConfig/reset", (req, res) => {
  try {
    fs.writeFileSync(FFMPEG_CONFIG_PATH, JSON.stringify(DEFAULT_FFMPEG_CONFIG, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Error resetting ffmpeg config:", err);
    res.status(500).json({ error: "Failed to reset ffmpeg config" });
  }
});

// Page Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "index.html"));
});

app.get("/serieDisplay", async (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "serieDisplay.html"));
});

app.get("/viewerM", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "viewerMovie.html"));
});

app.get("/viewerS", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "viewerSerie.html"));
});

app.get("/catalogue", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "catalogue.html"));
});

app.get("/search", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "search.html"));
});

app.get("/config", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "config.html"));
});

app.get("/add", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add.html"));
});

app.get("/add-movie", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-movie.html"));
});

app.post("/add-movie", upload.none(), async (req, res) => {
  try {
    const job = await addMovieHandler(req);
    res.json({ jobId: job.id, status: job.status });
  } catch (err) {
    console.error("Error adding movie:", err);
    res.status(500).json({ error: "Failed to add movie. Check server logs." });
  }
});

app.get("/add-serie", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-serie.html"));
});

app.post("/add-serie", upload.single("image"), async (req, res) => {
  try {
    await addSerie(req);
    res.redirect("/");
  } catch (err) {
    console.error("Error adding serie:", err);
    res.status(500).send("Failed to add serie. Check server logs.");
  }
});

app.get("/add-episode", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-episode.html"));
});

app.post("/add-episode", upload.none(), async (req, res) => {
  try {
    const job = await addEpisodeHandler(req);
    res.json({ jobId: job.id, status: job.status });
  } catch (err) {
    console.error("Error adding episode:", err);
    res.status(500).json({ error: "Failed to add episode. Check server logs." });
  }
});

// Catch-all static fallback (must be last)
app.use("/", express.static(path.join(__dirname, "public/html")));

app.listen(PORT, () => {
  console.log(`Localflix running on http://localhost:${PORT}`);
});
// Delete an episode by identifier
app.delete("/api/episode/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^A-Za-z0-9._\-]/g, "");
  if (!id) return res.status(400).json({ error: "Invalid episode ID" });

  try {
    // Look up the episode first so we know which serie folder its files live in
    const rows = await getDataEpisode(id);
    const episode = rows && rows[0];
    if (!episode) return res.status(404).json({ error: "Episode not found" });

    const serie = String(episode.serie_id).replace(/[^A-Za-z0-9._\- ]+/g, "");
    const episodePath = path.join(__dirname, "data", "serie", serie, `${id}.mp4`);
    const thumbnailPath = path.join(__dirname, "data", "thumbnail", serie, `${id}.jpg`);

    try { fs.unlinkSync(episodePath); } catch (_) {}
    try { fs.unlinkSync(thumbnailPath); } catch (_) {}
    try { await deleteSubtitlesForMedia("episode", id); } catch (_) {}

    const con = createConnection();

    await new Promise((resolve, reject) => {
      con.connect((err) => {
        if (err) { con.end(); return reject(err); }
        con.query("DELETE FROM episodes WHERE identifier = ?", [id], (err, result) => {
          con.end();
          if (err) return reject(err);
          resolve(result);
        });
      });
    });

    console.log(`[Delete] Episode deleted: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting episode:", err);
    res.status(500).json({ error: "Failed to delete episode" });
  }
});

// Global error-handling middleware — MUST be registered after every route.
// Without this, errors that reach Express via next(err) (which is exactly
// what happens when a multer fileFilter rejects a file, e.g. uploading a
// non-.srt file to /api/uploadSrt) fall through to Express's default error
// handler, which renders an HTML stack-trace page. The frontend always does
// `await resp.json()` on error responses, so an HTML body made that throw a
// confusing parse error instead of showing the actual validation message.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 400).json({ error: err.message || "Something went wrong" });
});
