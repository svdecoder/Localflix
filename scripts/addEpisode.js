import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

function truncate(input, maxLength) {
  return String(input).slice(0, maxLength);
}

const QUALITY_PRESETS = {
  "480p": { scale: "854:480", videoBitrate: "1000k", maxrate: "1200k", bufsize: "2000k" },
  "720p": { scale: "1280:720", videoBitrate: "2500k", maxrate: "3000k", bufsize: "5000k" },
  "1080p": { scale: "1920:1080", videoBitrate: "5000k", maxrate: "6000k", bufsize: "10000k" },
  "1440p": { scale: "2560:1440", videoBitrate: "8000k", maxrate: "10000k", bufsize: "16000k" },
  "original": null,
};

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

  const srtEntries = [];
  if (req.body.srtStaged) {
    const parts = String(req.body.srtStaged).split(",").filter(Boolean);
    for (const part of parts) {
      const [srtFilename, label] = part.split("|");
      const srtPath = path.join(__dirname, "..", "data", "uploads", inputSanitize(srtFilename));
      if (fs.existsSync(srtPath)) {
        srtEntries.push({ path: srtPath, label: inputSanitize(label || "External") });
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

  // Build ffmpeg command
  await new Promise((resolve, reject) => {
    const cmd = ffmpeg(uploadedFilePath);

    // Add each SRT as an additional input
    for (const srt of srtEntries) {
      cmd.input(srt.path);
    }

    // Always use explicit stream mapping — never rely on ffmpeg defaults
    const mapOpts = ["-map", "0:v:0?"];

    // Audio mapping — selectedAudioIndexes are ABSOLUTE stream indices from ffprobe.
    // We need to convert them to RELATIVE audio indices for ffmpeg -map.
    const streams = probeData?.streams || [];
    const audioStreams = streams.filter(s => s.codec_type === "audio");
    const subStreams = streams.filter(s => s.codec_type === "subtitle");

    if (selectedAudioIndexes.length > 0) {
      for (const absIdx of selectedAudioIndexes) {
        const relIdx = audioStreams.findIndex(s => s.index === absIdx);
        if (relIdx >= 0) {
          mapOpts.push("-map", `0:a:${relIdx}?`);
        }
      }
    } else {
      mapOpts.push("-map", "0:a?");
    }

    // Embedded subtitle mapping
    if (selectedSubtitleIndexes.length > 0) {
      for (const absIdx of selectedSubtitleIndexes) {
        const relIdx = subStreams.findIndex(s => s.index === absIdx);
        if (relIdx >= 0) {
          mapOpts.push("-map", `0:s:${relIdx}?`);
        }
      }
    }

    // External SRT mapping
    for (let i = 0; i < srtEntries.length; i++) {
      mapOpts.push("-map", `${i + 1}:0?`);
      mapOpts.push(`-metadata:s:s:${(selectedSubtitleIndexes.length || 0) + i}`, `title=${srtEntries[i].label}`);
    }

    // Video encoding — always H.264 + yuv420p for browser compatibility
    const preset = QUALITY_PRESETS[quality];
    const videoOpts = [
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
    ];
    if (preset) {
      videoOpts.push("-vf", `scale=${preset.scale}:force_original_aspect_ratio=decrease,pad=${preset.scale}:(ow-iw)/2:(oh-ih)/2`);
      videoOpts.push("-b:v", preset.videoBitrate);
      videoOpts.push("-maxrate", preset.maxrate);
      videoOpts.push("-bufsize", preset.bufsize);
    }

    // Audio encoding
    const audioOpts = [
      "-c:a", "aac",
      "-ac", "2",
    ];

    // Subtitle encoding
    const subtitleOpts = [];
    if (selectedSubtitleIndexes.length > 0 || srtEntries.length > 0) {
      subtitleOpts.push("-c:s", "mov_text");
    }

    const allOpts = [...mapOpts, ...videoOpts, ...audioOpts, ...subtitleOpts];

    console.log(`[FFmpeg] Starting conversion: ${uploadedFilePath} -> ${newEpisode}`);
    console.log(`[FFmpeg] Quality: ${quality}, Audio tracks: ${selectedAudioIndexes.length || "all"}, Subs: ${selectedSubtitleIndexes.length || "none"}, External SRTs: ${srtEntries.length}`);
    console.log(`[FFmpeg] Args: ${allOpts.join(" ")}`);

    cmd.outputOptions(allOpts).save(newEpisode);

    cmd.on("stderr", (line) => {
      console.log(`[FFmpeg] ${line}`);
    });

    cmd.on("progress", (info) => {
      if (info.percent) {
        console.log(`[FFmpeg] Progress: ${info.percent.toFixed(1)}% — Speed: ${info.currentFps || "?"} fps — Time: ${info.timemark}`);
      }
    });

    cmd.on("end", () => {
      console.log(`[FFmpeg] Conversion complete: ${newEpisode}`);
      ffmpeg(newEpisode)
        .outputOptions(["-ss", "00:00:20", "-vframes", "1", "-q:v", "3", "-vf", "scale=300:-1"])
        .save(newEpisodeThumbnail)
        .on("end", () => {
          console.log("Thumbnail generated successfully!");
          try {
            fs.unlinkSync(uploadedFilePath);
            console.log("Original file removed:", uploadedFilePath);
          } catch (err) {
            console.log("File removal failed:", err);
          }
          resolve();
        })
        .on("error", (err) => {
          console.log("Thumbnail generation failed:", err.message);
          try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
          resolve();
        });
    });

    cmd.on("error", (err) => {
      console.error(`[FFmpeg] Conversion FAILED: ${err.message}`);
      reject(err);
    });
  });

  await databaseAdd(req, episodeUploadName, newEpisode);
}

async function databaseAdd(req, episodeUploadName, newEpisode) {
  const title = truncate(inputSanitize(req.body.title), 255);
  const serie = truncate(inputSanitize(req.body.serieID), 255);
  const date = truncate(inputSanitize(req.body.releaseDate), 10);
  const description = truncate(inputSanitize(req.body.description), 255);
  const episode = truncate(inputSanitize(req.body.episod), 10);
  const season = truncate(inputSanitize(req.body.season), 10);

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