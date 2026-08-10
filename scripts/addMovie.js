import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../data/mysql/.env") });

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

const QUALITY_PRESETS = {
  "480p": { scale: "854:480", videoBitrate: "1000k", maxrate: "1200k", bufsize: "2000k" },
  "720p": { scale: "1280:720", videoBitrate: "2500k", maxrate: "3000k", bufsize: "5000k" },
  "1080p": { scale: "1920:1080", videoBitrate: "5000k", maxrate: "6000k", bufsize: "10000k" },
  "1440p": { scale: "2560:1440", videoBitrate: "8000k", maxrate: "10000k", bufsize: "16000k" },
  "original": null,
};

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

    // Audio mapping
    if (selectedAudioIndexes.length > 0) {
      for (const idx of selectedAudioIndexes) {
        mapOpts.push("-map", `0:a:${idx}?`);
      }
    } else {
      mapOpts.push("-map", "0:a?");
    }

    // Embedded subtitle mapping — filter out bitmap subtitles (PGS/HDMV) that can't be converted to mov_text
    const textSubCodecs = ["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "sami", "jacosub", "microdvd", "mpl2", "pjs", "realtext", "stl", "subviewer", "subviewer1", "vplayer", "dvb_subtitle"];
    let textSubCount = 0;
    if (selectedSubtitleIndexes.length > 0) {
      const streams = probeData?.streams || [];
      for (const idx of selectedSubtitleIndexes) {
        // Find the absolute stream index for this relative subtitle index
        let subRelIdx = 0;
        let subStream = null;
        for (const s of streams) {
          if (s.codec_type === "subtitle") {
            if (subRelIdx === idx) { subStream = s; break; }
            subRelIdx++;
          }
        }
        if (subStream && textSubCodecs.includes(subStream.codec_name)) {
          mapOpts.push("-map", `0:s:${idx}?`);
          textSubCount++;
        } else {
          console.log(`[FFmpeg] Skipping bitmap subtitle #${idx} (${subStream?.codec_name || "unknown"}) — cannot convert to mov_text`);
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

    // Subtitle encoding (mov_text for MP4 compatibility)
    const subtitleOpts = [];
    if (textSubCount > 0 || srtEntries.length > 0) {
      subtitleOpts.push("-c:s", "mov_text");
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
  const title = inputSanitize(req.body.title);
  const author = inputSanitize(req.body.author);
  const releaseDate = inputSanitize(req.body.releaseDate);
  const description = inputSanitize(req.body.description);
  const tags = inputSanitize(req.body.tags);

  const durationSeconds = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(newMovie, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
  const lengthMinutes = Math.round(durationSeconds / 60);

  const con = mysql.createConnection({
    host: process.env.HOST,
    user: "root",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DATABASE,
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