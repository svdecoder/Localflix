import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { createConnection } from "./dbConnection.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import runFfmpegJob from "./ffmpegJob.js";
import { addSubtitle } from "./subtitles.js";
import { getCompressionSettings } from "./ffmpegConfig.js";
import { runCompressionJob } from "./compressJob.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

function truncate(input, maxLength) {
  return String(input).slice(0, maxLength);
}

export default async function addMovieHandler(req) {
  const stagedFile = req.body.stagedFile;
  if (!stagedFile) throw new Error("No staged file reference. Upload the video first for analysis.");

  const filePath = path.join(__dirname, "..", "data", "uploads", inputSanitize(stagedFile));
  if (!fs.existsSync(filePath)) {
    throw new Error("Staged file not found. Please re-upload the video.");
  }

  const identifiers = inputSanitize(stagedFile);
  const moviesPath = path.join(__dirname, "..", "data", "movies");
  const thumbnailPath = path.join(__dirname, "..", "data", "thumbnail");
  if (!fs.existsSync(moviesPath)) fs.mkdirSync(moviesPath, { recursive: true });
  if (!fs.existsSync(thumbnailPath)) fs.mkdirSync(thumbnailPath, { recursive: true });
  const newMovie = path.join(moviesPath, `${identifiers}.mp4`);
  const movieThumb = path.join(thumbnailPath, `${identifiers}.jpg`);

  const quality = req.body.quality || "original";
  const selectedAudioIndexes = req.body.audioTracks
    ? (Array.isArray(req.body.audioTracks) ? req.body.audioTracks : [req.body.audioTracks])
        .map(Number)
        .filter((n) => !isNaN(n))
    : [];
  const selectedSubtitleIndexes = req.body.subtitleTracks
    ? (Array.isArray(req.body.subtitleTracks) ? req.body.subtitleTracks : [req.body.subtitleTracks])
        .map(Number)
        .filter((n) => !isNaN(n))
    : [];

  // External .srt uploads no longer get muxed into the video container (see
  // scripts/ffmpegJob.js) — instead they become sidecar subtitles once the
  // movie row exists, so their sync offset can be adjusted later without
  // re-encoding. srtStaged entries are "filename|language" pairs.
  const srtEntries = [];
  if (req.body.srtStaged) {
    const parts = String(req.body.srtStaged).split(",").filter(Boolean);
    for (const part of parts) {
      const [srtFilename, language] = part.split("|");
      const srtPath = path.join(__dirname, "..", "data", "uploads", inputSanitize(srtFilename));
      if (fs.existsSync(srtPath)) {
        srtEntries.push({ path: srtPath, language: inputSanitize(language || "und"), originalFilename: srtFilename });
      }
    }
  }

  // Probe the file to get codec info (used to filter out bitmap subtitles)
  const probeData = await new Promise((res) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { res(null); return; }
      res(meta);
    });
  });

  const metadata = {
    title: truncate(inputSanitize(req.body.title), 255),
    author: truncate(inputSanitize(req.body.author), 255),
    releaseDate: truncate(inputSanitize(req.body.releaseDate), 10),
    description: truncate(inputSanitize(req.body.description), 1000),
    tags: truncate(String(req.body.tags).replace(/[^A-Za-z0-9._\- ,]+/g, ""), 255),
  };

  const job = await runFfmpegJob({
    type: "movie",
    inputPath: filePath,
    outputPath: newMovie,
    thumbnailPath: movieThumb,
    probeData,
    options: {
      quality,
      selectedAudioIndexes,
      selectedSubtitleIndexes,
    },
    databaseAdd: async () => {
      await databaseAdd(metadata, identifiers, newMovie);
      await attachStagedSubtitles(identifiers, srtEntries);
      maybeAutoCompress("movie", identifiers, newMovie);
    },
  });

  return job;
}

// If enabled in config, automatically queue a compression job right after
// this upload's own encode finishes. Fire-and-forget: it just joins the
// same shared job queue as everything else (force:false, so the backend's
// "never commit a worse result" and "skip below minimum savings" guarantees
// apply exactly as they do for a manually-triggered compression), and runs
// once a processing slot frees up — it does not block or delay marking this
// upload job "completed".
function maybeAutoCompress(mediaType, mediaId, filePath) {
  try {
    const settings = getCompressionSettings();
    if (!settings.autoCompressAfterUpload) return;
    runCompressionJob({ mediaType, mediaId, filePath, force: false });
  } catch (err) {
    console.error(`Failed to queue auto-compression for ${mediaType} ${mediaId}:`, err.message);
  }
}

// Convert each staged .srt into a sidecar subtitle now that the movie row
// exists (so we know its identifier). Best-effort: one bad subtitle file
// shouldn't fail the whole upload, since the movie itself already succeeded.
async function attachStagedSubtitles(identifiers, srtEntries) {
  for (const entry of srtEntries) {
    try {
      await addSubtitle({
        mediaType: "movie",
        mediaId: identifiers,
        language: entry.language,
        originalFilename: entry.originalFilename,
        srtPath: entry.path,
      });
    } catch (err) {
      console.error(`Failed to attach subtitle "${entry.originalFilename}" to movie ${identifiers}:`, err.message);
    } finally {
      try { fs.unlinkSync(entry.path); } catch (_) {}
    }
  }
}

async function databaseAdd(metadata, identifiers, newMovie) {
  const { title, author, releaseDate, description, tags } = metadata;

  const durationSeconds = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(newMovie, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
  const lengthMinutes = Math.round(durationSeconds / 60);

  const con = createConnection();

  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql =
        "INSERT INTO movie (title, identifier, author, description, length_minutes, tags, release_date) VALUES (?,?,?,?,?,?,?)";
      con.query(sql, [title, identifiers, author, description, lengthMinutes, tags, releaseDate], (err, result) => {
        con.end();
        if (err) return reject(err);
        console.log("Movie inserted successfully!");
        resolve(result);
      });
    });
  });
}