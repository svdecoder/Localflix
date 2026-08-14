import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";
import { getQualityPresets, getEncodingSettings } from "./ffmpegConfig.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

function truncate(input, maxLength) {
  return String(input).slice(0, maxLength);
}

const QUALITY_PRESETS = getQualityPresets();
const ENCODING = getEncodingSettings();

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

  // Probe the file to get codec info (used to filter out bitmap subtitles)
  const probeData = await new Promise((res) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { res(null); return; }
      res(meta);
    });
  });

  // Build ffmpeg command
  await new Promise((resolve, reject) => {
    const cmd = ffmpeg(filePath);

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
        // Find the relative position of this absolute index among audio streams
        const relIdx = audioStreams.findIndex(s => s.index === absIdx);
        if (relIdx >= 0) {
          mapOpts.push("-map", `0:a:${relIdx}?`);
        }
      }
    } else {
      mapOpts.push("-map", "0:a?");
    }

    // Embedded subtitle mapping — filter out bitmap subtitles (PGS/HDMV) that can't be converted to mov_text
    const textSubCodecs = ["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "sami", "jacosub", "microdvd", "mpl2", "pjs", "realtext", "stl", "subviewer", "subviewer1", "vplayer", "dvb_subtitle"];
    let textSubCount = 0;
    if (selectedSubtitleIndexes.length > 0) {
      for (const absIdx of selectedSubtitleIndexes) {
        // Find the relative position of this absolute index among subtitle streams
        const relIdx = subStreams.findIndex(s => s.index === absIdx);
        if (relIdx >= 0) {
          const subStream = subStreams[relIdx];
          if (textSubCodecs.includes(subStream.codec_name)) {
            mapOpts.push("-map", `0:s:${relIdx}?`);
            textSubCount++;
          } else {
            console.log(`[FFmpeg] Skipping bitmap subtitle #${absIdx} (${subStream.codec_name}) — cannot convert to mov_text`);
          }
        }
      }
    }

    // External SRT mapping (always text-based)
    for (let i = 0; i < srtEntries.length; i++) {
      mapOpts.push("-map", `${i + 1}:0?`);
      mapOpts.push(`-metadata:s:s:${textSubCount + i}`, `title=${srtEntries[i].label}`);
    }

    // Video encoding — always H.264 + yuv420p for browser compatibility
    const preset = QUALITY_PRESETS[quality];
    const videoOpts = [
      "-c:v", "libx264",
      "-preset", ENCODING.preset || "fast",
      "-crf", ENCODING.crf || "23",
      "-pix_fmt", ENCODING.pix_fmt || "yuv420p",
      "-movflags", ENCODING.movflags || "+faststart",
    ];
    if (preset) {
      videoOpts.push("-vf", `scale=${preset.scale}:force_original_aspect_ratio=decrease,pad=${preset.scale}:(ow-iw)/2:(oh-ih)/2`);
      videoOpts.push("-b:v", preset.videoBitrate);
      videoOpts.push("-maxrate", preset.maxrate);
      videoOpts.push("-bufsize", preset.bufsize);
    }

    // Audio encoding
    const audioOpts = [
      "-c:a", ENCODING.audioCodec || "aac",
      "-ac", ENCODING.audioChannels || "2",
    ];

    // Subtitle encoding (mov_text for MP4 compatibility)
    const subtitleOpts = [];
    if (textSubCount > 0 || srtEntries.length > 0) {
      subtitleOpts.push("-c:s", ENCODING.subtitleCodec || "mov_text");
    }

    const allOpts = [...mapOpts, ...videoOpts, ...audioOpts, ...subtitleOpts];

    console.log(`[FFmpeg] Starting conversion: ${filePath} -> ${newMovie}`);
    console.log(`[FFmpeg] Quality: ${quality}, Audio tracks: ${selectedAudioIndexes.length || "all"}, Text subs: ${textSubCount}, External SRTs: ${srtEntries.length}`);
    console.log(`[FFmpeg] Args: ${allOpts.join(" ")}`);

    cmd.outputOptions(allOpts).save(newMovie);

    cmd.on("stderr", (line) => {
      console.log(`[FFmpeg] ${line}`);
    });

    cmd.on("progress", (info) => {
      if (info.percent) {
        console.log(`[FFmpeg] Progress: ${info.percent.toFixed(1)}% — Speed: ${info.currentFps || "?"} fps — Time: ${info.timemark}`);
      }
    });

    cmd.on("end", () => {
      console.log(`[FFmpeg] Conversion complete: ${newMovie}`);
      ffmpeg(newMovie)
        .outputOptions(["-ss", "00:00:20", "-vframes", "1", "-q:v", "3", "-vf", "scale=300:-1"])
        .save(movieThumb)
        .on("end", () => {
          console.log("Thumbnail generated successfully!");
          try {
            fs.unlinkSync(filePath);
            console.log("Original file removed:", filePath);
          } catch (err) {
            console.log("File removal failed:", err);
          }
          resolve();
        })
        .on("error", (err) => {
          console.log("Thumbnail generation failed:", err.message);
          try { fs.unlinkSync(filePath); } catch (_) {}
          resolve();
        });
    });

    cmd.on("error", (err) => {
      console.error(`[FFmpeg] Conversion FAILED: ${err.message}`);
      reject(err);
    });
  });

  await databaseAdd(req, identifiers, newMovie);
}

async function databaseAdd(req, identifiers, newMovie) {
  const title = truncate(inputSanitize(req.body.title), 255);
  const author = truncate(inputSanitize(req.body.author), 255);
  const releaseDate = truncate(inputSanitize(req.body.releaseDate), 10);
  const description = truncate(inputSanitize(req.body.description), 1000);
  const tags = truncate(String(req.body.tags).replace(/[^A-Za-z0-9._\- ,]+/g, ""), 255);

  const durationSeconds = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(newMovie, (err, metadata) => {
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