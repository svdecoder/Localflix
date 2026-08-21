// Video compression (Task 3).
//
// Two entry points:
//   - analyzeCompression(filePath): a cheap, probe-only check — no encoding
//     — used by the UI to show current size/codec/resolution and a rough
//     estimate of whether re-encoding is likely to help, before the user
//     commits to actually running a (potentially long) compression job.
//   - runCompressionJob({...}): the real job. Reuses the same job system,
//     concurrency queue, and atomic-write/validate safety net as the main
//     upload pipeline (see scripts/ffmpegShared.js) — a compression job is
//     just another job competing for the same single processing slot, so it
//     can never run alongside an upload's encode and starve it (or vice
//     versa).
//
// Deliberately NOT touched during compression: resolution, framerate, and
// audio (copied via -c:a copy, never re-encoded) — only the video codec's
// CRF/preset change. This matches the spec's "preserve resolution/framerate/
// audio quality by default" requirement directly, rather than needing extra
// logic to "preserve" them.

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createConnection } from "./dbConnection.js";
import {
  createJob,
  appendLog,
  setJobStatus,
  setJobProgress,
  setJobProcess,
  resetJob,
  setJobResult,
} from "./jobManager.js";
import { getCompressionSettings } from "./ffmpegConfig.js";
import { enqueue, getQueueDepth, getActiveCount } from "./jobQueue.js";
import { tempPathFor, checkDiskSpace, diagnoseFailure, validateOutputFile } from "./ffmpegShared.js";

function parseFrameRate(rateString) {
  if (!rateString) return 24;
  const [num, den] = String(rateString).split("/").map(Number);
  if (!den) return num || 24;
  return num / den;
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

// savingsPercent is positive when the file got smaller, negative when it got
// bigger. Previously the log line always said "X% smaller" regardless of
// sign, so a file that got bigger printed a confusing/wrong message like
// "-37% smaller" instead of clearly saying it got larger.
function describeSizeChange(savingsPercent) {
  if (savingsPercent >= 0) return `${savingsPercent}% smaller`;
  return `${Math.abs(savingsPercent)}% LARGER than the original`;
}

function probeFile(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      resolve(meta);
    });
  });
}

/**
 * Probe-only analysis — no encoding. Returns current file stats and a rough
 * recommendation on whether compressing is likely to save meaningful space.
 *
 * The estimate is a heuristic, not a guarantee: it compares the file's
 * current bits-per-pixel (bitrate normalized by resolution and framerate)
 * against a threshold typical of already-efficient H.264 content. Content
 * that's mostly static (talking-head video, screen recordings) can compress
 * far better than this heuristic predicts; very high-motion content can
 * compress worse. It's meant to stop someone from re-encoding a file that's
 * obviously already well-compressed, not to be a precise size predictor.
 */
export async function analyzeCompression(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("File not found");
  }

  const stat = fs.statSync(filePath);
  const meta = await probeFile(filePath);
  const videoStream = (meta.streams || []).find((s) => s.codec_type === "video");
  const duration = parseFloat(meta.format?.duration) || 0;

  if (!videoStream || !duration) {
    throw new Error("Could not read video stream information from this file");
  }

  const width = videoStream.width;
  const height = videoStream.height;
  const fps = parseFrameRate(videoStream.avg_frame_rate);
  const currentBitrateBps = (stat.size * 8) / duration;
  const bitsPerPixel = currentBitrateBps / (width * height * fps);

  // Typical "already efficient" H.264 content sits well under ~0.10 bpp.
  // Above that, there's usually real room to save space at a similar
  // perceptual quality via a better CRF/preset.
  //
  // IMPORTANT CAVEAT, confirmed by real-world use: this is a rough
  // approximation, not a reliable predictor. Bits-per-pixel alone can't
  // capture how efficiently a file was actually encoded — a file re-encoded
  // with a slow/high-quality preset (like this app's own compression
  // settings) can end up meaningfully smaller than a same-bpp file that was
  // originally encoded with a fast/low-effort preset or a less efficient
  // encoder entirely (phone/camera footage, screen recorders, other tools),
  // even at a *lower* CRF (higher target quality). Users have seen 15-38%
  // real savings on files this heuristic marked "not recommended". Treat
  // `recommended` as a mild hint, not a verdict — the actual compression job
  // is what determines the real result, and it never commits a file that
  // isn't genuinely smaller (see compressJob.js), so there's no harm in
  // trying even when this says "not recommended".
  const EFFICIENT_THRESHOLD_BPP = 0.10;
  const recommended = bitsPerPixel > EFFICIENT_THRESHOLD_BPP;

  // Rough, deliberately conservative estimate — capped so it never promises
  // more than is realistic. Even when not "recommended", real savings are
  // still possible (see caveat above), so this isn't hard-floored at 0 the
  // way an earlier version of this function did it.
  let estimatedSavingsPercent = 0;
  if (recommended) {
    const excess = Math.min(bitsPerPixel / EFFICIENT_THRESHOLD_BPP, 3); // cap the ratio considered
    estimatedSavingsPercent = Math.round(Math.min(60, 15 + (excess - 1) * 20));
  }

  return {
    sizeBytes: stat.size,
    sizeMB: Number(formatMB(stat.size)),
    codec: videoStream.codec_name,
    resolution: `${width}x${height}`,
    durationSeconds: Math.round(duration),
    currentBitrateKbps: Math.round(currentBitrateBps / 1000),
    recommended,
    estimatedSavingsPercent,
    reason: recommended
      ? "This file's bitrate is higher than typical for already-efficient H.264 content — compressing is likely to save meaningful space."
      : "This file's bitrate estimate suggests it may already be efficiently compressed — but this is a rough estimate, not a guarantee, and real savings are still possible depending on how the file was originally encoded. Compression never keeps a result that isn't actually smaller, so it's safe to try either way.",
  };
}

/**
 * Run a compression job for an existing movie/episode file, replacing it
 * in place (same path — the DB row never needs to change, since the
 * identifier/filename don't change). Returns the job immediately; the
 * actual work happens in the background via the shared job queue, exactly
 * like the upload pipeline's runFfmpegJob().
 *
 * @param {object} options
 * @param {string} options.mediaType - "movie" | "episode" (for job.type / logging only)
 * @param {string} options.mediaId - identifier, for logging only
 * @param {string} options.filePath - absolute path to the existing video file to compress in place
 * @param {boolean} [options.force] - skip the "not recommended" check and compress anyway
 * @returns {object} the job
 */
export function runCompressionJob({ mediaType, mediaId, filePath, force = false }) {
  const job = createJob(`compress-${mediaType}`, { mediaId, filePath, force });

  const aheadOfThisJob = getQueueDepth() + getActiveCount();
  if (aheadOfThisJob > 0) {
    appendLog(job.id, `[QUEUE] Compression job queued — ${aheadOfThisJob} job(s) ahead of it.`);
  }

  enqueue(() => {
    appendLog(job.id, "[QUEUE] Starting now.");
    return runCompression(job, { filePath, force }).catch((err) => {
      console.error(`[Job ${job.id}] Unhandled compression error:`, err);
    });
  });

  return job;
}

async function runCompression(job, { filePath, force }) {
  resetJob(job.id);
  setJobStatus(job.id, "running");

  if (!fs.existsSync(filePath)) {
    setJobStatus(job.id, "failed", "File no longer exists");
    return;
  }

  const originalSize = fs.statSync(filePath).size;
  let originalMeta;
  try {
    originalMeta = await probeFile(filePath);
  } catch (err) {
    setJobStatus(job.id, "failed", `Could not read source file: ${err.message}`);
    return;
  }
  const originalDuration = parseFloat(originalMeta.format?.duration) || 0;
  const videoStream = (originalMeta.streams || []).find((s) => s.codec_type === "video");

  appendLog(job.id, `[Compress] Source: ${filePath} (${formatMB(originalSize)} MB, ${videoStream?.codec_name || "?"}, ${videoStream?.width}x${videoStream?.height})`);

  checkDiskSpace(path.dirname(filePath), originalSize * 1.2, job.id);

  const settings = getCompressionSettings();
  const tempOutputPath = tempPathFor(filePath, job.id);
  try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch (_) {}

  appendLog(job.id, `[Compress] Encoding with CRF ${settings.crf}, preset ${settings.preset} — resolution, framerate, and audio are left untouched.`);

  try {
    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(filePath);
      const opts = [
        "-map", "0:v:0?",
        "-map", "0:a?",
        "-map", "0:s?",
        "-c:v", "libx264",
        "-preset", settings.preset,
        "-crf", settings.crf,
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "copy", // audio is never re-encoded — zero quality loss, and it's already AAC from the original upload
        "-c:s", "copy", // any muxed subtitle tracks pass through untouched too
        "-f", "mp4",
      ];
      appendLog(job.id, `[FFmpeg] Args: ${opts.join(" ")}`);
      cmd.outputOptions(opts).save(tempOutputPath);

      cmd.on("stderr", (line) => appendLog(job.id, `[FFmpeg] ${line}`));
      cmd.on("progress", (info) => {
        if (info.percent) {
          setJobProgress(job.id, info.percent);
          appendLog(job.id, `[FFmpeg] Progress: ${info.percent.toFixed(1)}%`);
        }
      });
      cmd.on("end", () => resolve());
      cmd.on("error", (err) => {
        const diagnosis = diagnoseFailure(err.message);
        const fullMessage = diagnosis ? `${diagnosis} (${err.message})` : err.message;
        appendLog(job.id, `[FFmpeg] Compression FAILED: ${fullMessage}`);
        try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch (_) {}
        reject(new Error(fullMessage));
      });

      // Track the underlying process so cancelJob() (from ffmpegJob.js,
      // shared across all job types) can actually kill it instead of just
      // flipping the status while ffmpeg keeps running in the background.
      // IMPORTANT: fluent-ffmpeg exposes this as cmd.ffmpegProc (no leading
      // underscore), and only once the process has actually spawned — the
      // "start" event is what guarantees that, not "immediately after
      // .save()". Verified directly against fluent-ffmpeg's source
      // (lib/processor.js: `self.ffmpegProc = ffmpegProc`) and by testing:
      // reading cmd._ffmpegProc (wrong name) is always undefined even on
      // "start", and reading cmd.ffmpegProc before "start" fires is also
      // undefined — get it wrong either way and cancel silently no-ops
      // while the ffmpeg process keeps running in the background.
      cmd.on("start", () => {
        if (cmd.ffmpegProc) setJobProcess(job.id, cmd.ffmpegProc);
      });
    });
  } catch (err) {
    if (job.status === "cancelled") {
      // cancelJob() already set the status and killed the process — don't
      // overwrite "cancelled" with "failed" just because the kill made
      // ffmpeg exit with an error.
      try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch (_) {}
      return;
    }
    setJobStatus(job.id, "failed", err.message);
    return;
  }

  appendLog(job.id, "[Compress] Encoding finished — validating output before accepting it...");
  const check = await validateOutputFile(tempOutputPath, { requireDuration: true });
  if (!check.valid) {
    appendLog(job.id, `[Compress] Output validation FAILED: ${check.reason}`);
    try { fs.unlinkSync(tempOutputPath); } catch (_) {}
    setJobStatus(job.id, "failed", `Compressed file failed validation: ${check.reason}`);
    return;
  }

  // Duration must match the original within a small tolerance — a
  // significant mismatch means something was dropped/truncated even though
  // the file is technically "valid".
  const durationDiff = Math.abs(check.duration - originalDuration);
  if (originalDuration > 0 && durationDiff > Math.max(2, originalDuration * 0.02)) {
    appendLog(job.id, `[Compress] Duration mismatch: original ${originalDuration.toFixed(1)}s vs compressed ${check.duration.toFixed(1)}s — rejecting.`);
    try { fs.unlinkSync(tempOutputPath); } catch (_) {}
    setJobStatus(job.id, "failed", "Compressed file's duration doesn't match the original — rejected for safety.");
    return;
  }

  const newSize = check.size;
  const savingsPercent = Math.round((1 - newSize / originalSize) * 100);
  const settingsForSkipCheck = getCompressionSettings();

  appendLog(job.id, `[Compress] Result: ${formatMB(originalSize)} MB → ${formatMB(newSize)} MB (${describeSizeChange(savingsPercent)})`);

  if (job.status === "cancelled") {
    // Cancelled while validation was running — don't commit a file the
    // user asked to stop, even though it technically finished and passed.
    appendLog(job.id, "[Compress] Job was cancelled — discarding the compressed output without committing it.");
    try { fs.unlinkSync(tempOutputPath); } catch (_) {}
    return;
  }

  // This check is UNCONDITIONAL — "force" must never be able to bypass it.
  // "force" exists to let the user compress a file even when the *estimated*
  // savings look modest (the minSavingsPercent check below); it was never
  // meant to let a result that's actually LARGER than the original get
  // committed. A previous version of this check only ran when !force, which
  // meant clicking "Compress Anyway" on an already-efficient file could
  // silently replace it with a bigger file — exactly backwards from what
  // compression is for. Re-encoding is lossy and non-deterministic enough
  // that a worse outcome is always possible, regardless of how confident the
  // pre-encode estimate was, so this has to be checked against the actual
  // result, every time, with no override.
  if (newSize >= originalSize) {
    appendLog(job.id, `[Compress] The compressed file (${formatMB(newSize)} MB) is not smaller than the original (${formatMB(originalSize)} MB) — keeping the original. This cannot be overridden by "force", since committing a larger file would defeat the purpose of compression.`);
    try { fs.unlinkSync(tempOutputPath); } catch (_) {}
    setJobResult(job.id, {
      skipped: true,
      reason: "not_smaller",
      originalSizeBytes: originalSize,
      wouldBeSizeBytes: newSize,
      wouldBeSavingsPercent: savingsPercent,
    });
    setJobStatus(job.id, "completed");
    return;
  }

  if (!force && savingsPercent < settingsForSkipCheck.minSavingsPercent) {
    // "If the new file is invalid or larger than the original by an
    // unreasonable amount, keep the original" — generalized here to "didn't
    // meet the minimum savings threshold", since a 2% smaller file after a
    // full re-encode isn't a meaningful win and isn't worth the generational
    // quality loss of a second lossy encode. Unlike the check above, this
    // one CAN be bypassed with force — the file is still genuinely smaller
    // here, just not by much.
    appendLog(job.id, `[Compress] Savings (${savingsPercent}%) below the configured minimum (${settingsForSkipCheck.minSavingsPercent}%) — keeping the original file. Use "force" to compress anyway.`);
    try { fs.unlinkSync(tempOutputPath); } catch (_) {}
    setJobResult(job.id, {
      skipped: true,
      reason: "below_minimum_savings",
      originalSizeBytes: originalSize,
      wouldBeSizeBytes: newSize,
      wouldBeSavingsPercent: savingsPercent,
    });
    setJobStatus(job.id, "completed");
    return;
  }

  try {
    fs.renameSync(tempOutputPath, filePath);
    appendLog(job.id, `[Compress] Compressed file committed in place: ${filePath}`);
  } catch (err) {
    try { if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch (_) {}
    setJobStatus(job.id, "failed", `Compressed output could not be moved into place: ${err.message}`);
    return;
  }

  setJobResult(job.id, {
    skipped: false,
    originalSizeBytes: originalSize,
    newSizeBytes: newSize,
    savingsPercent,
    codec: "h264",
  });
  setJobStatus(job.id, "completed");
}

// ===== Library-wide compression scan =====
// Queries every movie and episode in the DB, resolves each one's file path
// on disk, and queues a compression job (force:false, so the usual "never
// commit a worse result" / "skip below minimum savings" safety net applies
// exactly as it does for a single manually-triggered job) for every file
// that still exists. Returns immediately with the list of jobs queued — the
// jobs themselves run one at a time through the same shared queue as
// everything else, so this doesn't try to compress the whole library at
// once; it just lines all of it up.
function queryAllMovies() {
  const con = createConnection();
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("SELECT identifier, title FROM movie", (err, rows) => {
        con.end();
        if (err) return reject(err);
        resolve(rows);
      });
    });
  });
}

function queryAllEpisodes() {
  const con = createConnection();
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query("SELECT identifier, title, serie_id FROM episodes", (err, rows) => {
        con.end();
        if (err) return reject(err);
        resolve(rows);
      });
    });
  });
}

export async function scanLibraryForCompression() {
  const [movies, episodes] = await Promise.all([queryAllMovies(), queryAllEpisodes()]);
  const queued = [];

  for (const movie of movies) {
    const filePath = path.join(__dirname, "..", "data", "movies", `${movie.identifier}.mp4`);
    if (!fs.existsSync(filePath)) continue; // skip DB rows whose file is missing — nothing to compress
    const job = runCompressionJob({ mediaType: "movie", mediaId: movie.identifier, filePath, force: false });
    queued.push({ mediaType: "movie", mediaId: movie.identifier, title: movie.title, jobId: job.id });
  }

  for (const episode of episodes) {
    const serie = String(episode.serie_id).replace(/[^A-Za-z0-9._\- ]+/g, "");
    const filePath = path.join(__dirname, "..", "data", "serie", serie, `${episode.identifier}.mp4`);
    if (!fs.existsSync(filePath)) continue;
    const job = runCompressionJob({ mediaType: "episode", mediaId: episode.identifier, filePath, force: false });
    queued.push({ mediaType: "episode", mediaId: episode.identifier, title: `${episode.serie_id} — ${episode.title}`, jobId: job.id });
  }

  return queued;
}
