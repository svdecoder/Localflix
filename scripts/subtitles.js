// Sidecar subtitle management.
//
// These are subtitles stored as independent .vtt files on disk, tracked in
// the `subtitles` table, and referenced from the viewer as extra <track>
// elements — distinct from subtitle tracks muxed directly into a video's
// container (which are handled elsewhere, via ffprobe + /api/subtitle).
//
// The whole point of this module existing separately from the muxed-track
// path is that a sidecar subtitle's timing offset can be adjusted without
// re-encoding anything: offset_ms is pure metadata, applied client-side when
// the track is loaded into the player.

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dbConfig from "./dbConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBTITLES_ROOT = path.join(__dirname, "..", "data", "subtitles");

function getConnection() {
  return mysql.createConnection({
    host: dbConfig.host,
    user: "root",
    password: dbConfig.password,
    database: dbConfig.database,
  });
}

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

// Only "movie" or "episode" are ever valid — anything else is a programming
// error, not user input to gracefully reject, so this is intentionally strict.
function assertMediaType(mediaType) {
  if (mediaType !== "movie" && mediaType !== "episode") {
    throw new Error(`Invalid media type: ${mediaType}`);
  }
}

function mediaSubtitleDir(mediaType, mediaId) {
  return path.join(SUBTITLES_ROOT, mediaType, inputSanitize(mediaId));
}

/**
 * Convert a .srt file to WebVTT using the ffmpeg binary already required by
 * the rest of the app (no new dependency needed — .srt and WebVTT are both
 * simple enough text-based formats that ffmpeg converts directly).
 */
function srtToVtt(srtPath, vttPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(srtPath)
      .output(vttPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`SRT→VTT conversion failed: ${err.message}`)))
      .run();
  });
}

/**
 * Convert a staged .srt upload into a persisted sidecar subtitle: converts
 * to .vtt, stores it under data/subtitles/<mediaType>/<mediaId>/, and
 * inserts the DB row. Returns the created row (camelCase-ish shape matching
 * what the API returns).
 */
export async function addSubtitle({ mediaType, mediaId, language, originalFilename, srtPath }) {
  assertMediaType(mediaType);
  if (!mediaId) throw new Error("mediaId is required");
  if (!srtPath || !fs.existsSync(srtPath)) throw new Error("Source .srt file not found");

  const safeMediaId = inputSanitize(mediaId);
  const dir = mediaSubtitleDir(mediaType, safeMediaId);
  fs.mkdirSync(dir, { recursive: true });

  const subtitleId = crypto.randomUUID();
  const vttPath = path.join(dir, `${subtitleId}.vtt`);

  await srtToVtt(srtPath, vttPath);

  // Store the path relative to data/subtitles so it's stable regardless of
  // where the app is deployed, and safe to hand back to the frontend.
  const relativeStoragePath = path.join(mediaType, safeMediaId, `${subtitleId}.vtt`);
  const safeLanguage = truncate(inputSanitize(language || "und"), 50) || "und";
  const safeOriginalFilename = truncate(inputSanitize(originalFilename || "subtitle.srt"), 255);

  const con = getConnection();
  const row = await new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      const sql =
        "INSERT INTO subtitles (media_type, media_id, language, original_filename, storage_path, format, offset_ms) VALUES (?, ?, ?, ?, ?, 'vtt', 0)";
      con.query(sql, [mediaType, safeMediaId, safeLanguage, safeOriginalFilename, relativeStoragePath], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve({
          id: result.insertId,
          mediaType,
          mediaId: safeMediaId,
          language: safeLanguage,
          originalFilename: safeOriginalFilename,
          storagePath: relativeStoragePath,
          format: "vtt",
          offsetMs: 0,
        });
      });
    });
  });

  return row;
}

function truncate(input, maxLength) {
  return String(input ?? "").slice(0, maxLength);
}

function rowToApi(row) {
  return {
    id: row.id,
    mediaType: row.media_type,
    mediaId: row.media_id,
    language: row.language,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    format: row.format,
    offsetMs: row.offset_ms,
    createdAt: row.created_at,
  };
}

export async function getSubtitles(mediaType, mediaId) {
  assertMediaType(mediaType);
  const con = getConnection();
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query(
        "SELECT * FROM subtitles WHERE media_type = ? AND media_id = ? ORDER BY created_at ASC",
        [mediaType, inputSanitize(mediaId)],
        (err, rows) => {
          con.end();
          if (err) return reject(err);
          resolve(rows.map(rowToApi));
        }
      );
    });
  });
}

export async function getSubtitleById(id) {
  const con = getConnection();
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("SELECT * FROM subtitles WHERE id = ?", [id], (err, rows) => {
        con.end();
        if (err) return reject(err);
        resolve(rows[0] ? rowToApi(rows[0]) : null);
      });
    });
  });
}

export async function updateSubtitleOffset(id, offsetMs) {
  const parsed = parseInt(offsetMs, 10);
  if (isNaN(parsed)) throw new Error("offsetMs must be a number");

  const con = getConnection();
  await new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("UPDATE subtitles SET offset_ms = ? WHERE id = ?", [parsed, id], (err, result) => {
        con.end();
        if (err) return reject(err);
        if (result.affectedRows === 0) return reject(new Error("Subtitle not found"));
        resolve();
      });
    });
  });

  return getSubtitleById(id);
}

export async function deleteSubtitle(id) {
  const existing = await getSubtitleById(id);
  if (!existing) throw new Error("Subtitle not found");

  const filePath = path.join(SUBTITLES_ROOT, existing.storagePath);
  try { fs.unlinkSync(filePath); } catch (_) {}

  const con = getConnection();
  await new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("DELETE FROM subtitles WHERE id = ?", [id], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}

/**
 * Delete every sidecar subtitle (files + DB rows) for a given media item.
 * Called when the movie/episode itself is deleted, so subtitles don't
 * outlive the video they belong to.
 */
export async function deleteSubtitlesForMedia(mediaType, mediaId) {
  assertMediaType(mediaType);
  const safeMediaId = inputSanitize(mediaId);

  const con = getConnection();
  await new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("DELETE FROM subtitles WHERE media_type = ? AND media_id = ?", [mediaType, safeMediaId], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });

  const dir = mediaSubtitleDir(mediaType, safeMediaId);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}
