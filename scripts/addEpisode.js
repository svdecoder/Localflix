import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";
import runFfmpegJob from "./ffmpegJob.js";
import { addSubtitle } from "./subtitles.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

function truncate(input, maxLength) {
  return String(input).slice(0, maxLength);
}

export default async function addEpisodeHandler(req) {
  const stagedFile = req.body.stagedFile;
  if (!stagedFile) throw new Error("No staged file reference. Upload the video first for analysis.");

  const serie = truncate(inputSanitize(req.body.serieID), 255);
  const episodeUploadName = truncate(inputSanitize(stagedFile), 255);
  const episodePath = path.join(__dirname, "..", "data", "serie", serie);
  const thumbnailPath = path.join(__dirname, "..", "data", "thumbnail", serie);
  const uploadedFilePath = path.join(__dirname, "..", "data", "uploads", stagedFile);
  const newEpisode = path.join(episodePath, `${episodeUploadName}.mp4`);
  const newEpisodeThumbnail = path.join(thumbnailPath, `${episodeUploadName}.jpg`);

  if (!fs.existsSync(uploadedFilePath)) {
    throw new Error("Staged file not found. Please re-upload the video.");
  }

  if (!fs.existsSync(episodePath)) fs.mkdirSync(episodePath, { recursive: true });
  if (!fs.existsSync(thumbnailPath)) fs.mkdirSync(thumbnailPath, { recursive: true });

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
  // episode row exists, so their sync offset can be adjusted later without
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

  // Probe the file to get stream info (needed for absolute→relative index conversion)
  const probeData = await new Promise((res) => {
    ffmpeg.ffprobe(uploadedFilePath, (err, meta) => {
      if (err) { res(null); return; }
      res(meta);
    });
  });

  const metadata = {
    title: truncate(inputSanitize(req.body.title), 255),
    serie,
    date: truncate(inputSanitize(req.body.releaseDate), 10),
    description: truncate(inputSanitize(req.body.description), 255),
    episode: truncate(inputSanitize(req.body.episod), 10),
    season: truncate(inputSanitize(req.body.season), 10),
  };

  const job = await runFfmpegJob({
    type: "episode",
    inputPath: uploadedFilePath,
    outputPath: newEpisode,
    thumbnailPath: newEpisodeThumbnail,
    probeData,
    options: {
      quality,
      selectedAudioIndexes,
      selectedSubtitleIndexes,
    },
    databaseAdd: async () => {
      await databaseAdd(metadata, episodeUploadName, newEpisode);
      await attachStagedSubtitles(episodeUploadName, srtEntries);
    },
  });

  return job;
}

// Convert each staged .srt into a sidecar subtitle now that the episode row
// exists (so we know its identifier). Best-effort: one bad subtitle file
// shouldn't fail the whole upload, since the episode itself already succeeded.
async function attachStagedSubtitles(episodeUploadName, srtEntries) {
  for (const entry of srtEntries) {
    try {
      await addSubtitle({
        mediaType: "episode",
        mediaId: episodeUploadName,
        language: entry.language,
        originalFilename: entry.originalFilename,
        srtPath: entry.path,
      });
    } catch (err) {
      console.error(`Failed to attach subtitle "${entry.originalFilename}" to episode ${episodeUploadName}:`, err.message);
    } finally {
      try { fs.unlinkSync(entry.path); } catch (_) {}
    }
  }
}

async function databaseAdd(metadata, episodeUploadName, newEpisode) {
  const { title, serie, date, description, episode, season } = metadata;

  const durationSeconds = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(newEpisode, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
  const lengthMinutes = Math.round(durationSeconds / 60);

  const con = mysql.createConnection({
    host: dbConfig.host,
    user: "root",
    password: dbConfig.password,
    database: dbConfig.database,
  });

  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql =
        "INSERT INTO episodes (title, identifier, description, length_minutes, episode, season, serie_id, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      con.query(
        sql,
        [title, episodeUploadName, description, lengthMinutes, episode, season, serie, date],
        (err, result) => {
          con.end();
          if (err) return reject(err);
          console.log("Episode inserted successfully!");
          resolve(result);
        }
      );
    });
  });
}