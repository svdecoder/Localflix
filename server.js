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
import getDataSeries from "./scripts/getDataSerie.js";
import getDataEpisodes from "./scripts/getDataEpisodes.js";
import getDataEpisode from "./scripts/getDataEpisode.js";
import search from "./scripts/search.js";
import addSerie from "./scripts/addSerie.js";
import addEpisodeHandler from "./scripts/addEpisode.js";
import { getVideoTracks } from "./scripts/videoProbe.js";
import dbConfig from "./scripts/dbConfig.js";
import fs from "fs";

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
app.use("/data/movie", express.static(path.join(__dirname, "data/movies")));
app.use("/data/serie", express.static(path.join(__dirname, "data/serie")));
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

    const mysql = await import("mysql2");

    const con = mysql.createConnection({
      host: dbConfig.host,
      user: "root",
      password: dbConfig.password,
      database: dbConfig.database,
    });

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

// Search series by partial title (for autocomplete)
app.get("/api/searchSeries", async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 1) return res.json([]);
  try {
    const mysql = await import("mysql2");

    const con = mysql.createConnection({
      host: dbConfig.host,
      user: "root",
      password: dbConfig.password,
      database: dbConfig.database,
    });

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

    const mysql = await import("mysql2");

    const con = mysql.createConnection({
      host: dbConfig.host,
      user: "root",
      password: dbConfig.password,
      database: dbConfig.database,
    });

    await new Promise((resolve, reject) => {
      con.connect((err) => {
        if (err) { con.end(); return reject(err); }
        con.query("DELETE FROM episodes WHERE serie_id = ?", [title], (err) => {
          if (err) { con.end(); return reject(err); }
          con.query("DELETE FROM series WHERE title = ?", [title], (err, result) => {
            con.end();
            if (err) return reject(err);
            resolve(result);
          });
        });
      });
    });

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

// ===== Chunked Upload System =====
// Solves Cloudflare 100MB limit by splitting uploads into 25MB chunks

// Receive a single chunk (raw binary, 25MB max)
app.post("/api/chunkUpload", express.raw({ type: "application/octet-stream", limit: "30mb" }), (req, res) => {
  const uploadId = req.headers["x-upload-id"];
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
  const { uploadId, originalName } = req.body;
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

app.get("/search", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "search.html"));
});

app.get("/add", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add.html"));
});

app.get("/add-movie", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-movie.html"));
});

app.post("/add-movie", upload.none(), async (req, res) => {
  try {
    await addMovieHandler(req);
    res.redirect("/");
  } catch (err) {
    console.error("Error adding movie:", err);
    res.status(500).send("Failed to add movie. Check server logs.");
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
    await addEpisodeHandler(req);
    res.redirect("/");
  } catch (err) {
    console.error("Error adding episode:", err);
    res.status(500).send("Failed to add episode. Check server logs.");
  }
});

// Catch-all static fallback (must be last)
app.use("/", express.static(path.join(__dirname, "public/html")));

app.listen(PORT, () => {
  console.log(`Localflix running on http://localhost:${PORT}`);
});