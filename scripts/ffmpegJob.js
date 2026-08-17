import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import {
  createJob,
  appendLog,
  setJobStatus,
  setJobProgress,
  setJobProcess,
  killJobProcess,
  resetJob,
  getJob,
} from "./jobManager.js";
import { getQualityPresets, getEncodingSettings } from "./ffmpegConfig.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

/**
 * Run an ffmpeg conversion as a tracked job.
 *
 * @param {object} options
 * @param {string} options.type - "movie" | "episode"
 * @param {string} options.inputPath - Path to the staged uploaded file
 * @param {string} options.outputPath - Path where the converted mp4 will be written
 * @param {string} options.thumbnailPath - Path where the thumbnail jpg will be written
 * @param {string[]} options.srtPaths - External SRT file paths (additional ffmpeg inputs)
 * @param {object} options.probeData - ffprobe metadata (for stream index conversion)
 * @param {object} options.options - { quality, selectedAudioIndexes, selectedSubtitleIndexes, srtEntries }
 * @param {object} options.metadata - { title, author, releaseDate, description, tags, serie, episode, season }
 * @param {function} options.databaseAdd - Async function to insert into DB after conversion
 * @returns {Promise<object>} The job object
 */
export default function runFfmpegJob(options) {
  const {
    type,
    inputPath,
    outputPath,
    thumbnailPath,
    probeData,
    options: jobOpts,
    databaseAdd,
  } = options;

  const job = createJob(type, {
    inputPath,
    outputPath,
    thumbnailPath,
    options: jobOpts,
  });
  // Store the databaseAdd function on the job so restartJob can use it
  job.databaseAdd = databaseAdd;

  // IMPORTANT: do NOT await the conversion here. The caller (the /add-movie
  // and /add-episode route handlers) needs the job id back immediately so the
  // browser can open an SSE connection to /api/job/:id/stream and watch live
  // progress. Awaiting the full ffmpeg run (which can take many minutes) would
  // keep the HTTP request pending the whole time, which is what caused the
  // "Failed to start processing" error on the frontend.
  runWithRetries(job, { inputPath, outputPath, thumbnailPath, probeData, options: jobOpts, databaseAdd }).catch((err) => {
    // runWithRetries already reports failures onto the job/log; this catch is
    // just a safety net so a truly unexpected error can't crash the process.
    console.error(`[Job ${job.id}] Unhandled processing error:`, err);
  });

  return job;
}

async function runWithRetries(job, { inputPath, outputPath, thumbnailPath, probeData, options: jobOpts, databaseAdd }) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Check for cancellation before starting a new attempt — this catches a
    // cancel request that arrived while we were sleeping between retries,
    // which previously got silently overridden by the next attempt's
    // resetJob()/setJobStatus("running") calls.
    if (job.status === "cancelled") {
      return job;
    }

    if (attempt > 1) {
      appendLog(job.id, `[RETRY] Attempt ${attempt}/${MAX_RETRIES} starting in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

      // Re-check immediately after the sleep — the whole point of this
      // window is that cancellation can happen while we're waiting.
      if (job.status === "cancelled") {
        return job;
      }
    }

    try {
      await runSingleAttempt(job, {
        inputPath,
        outputPath,
        thumbnailPath,
        probeData,
        options: jobOpts,
      });
      // Success — insert into DB
      await databaseAdd(job);
      setJobStatus(job.id, "completed");
      return job;
    } catch (err) {
      lastError = err;
      appendLog(job.id, `[ERROR] ${err.message}`);
      // Clean up partial output
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
      try { if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath); } catch (_) {}

      if (job.status === "cancelled") {
        setJobStatus(job.id, "cancelled");
        return job;
      }

      if (attempt < MAX_RETRIES) {
        appendLog(job.id, `[RETRY] Attempt ${attempt} failed. Will retry (${MAX_RETRIES - attempt} remaining).`);
      }
    }
  }

  // All retries exhausted. Deliberately NOT deleting inputPath here, even
  // though it's tempting to clean it up: the staged upload is exactly what
  // restartJob() needs to attempt a manual restart later (it checks
  // fs.existsSync(inputPath) and refuses to restart if it's gone). Auto-
  // deleting on failure would silently break the "Restart" button for every
  // job that exhausts its retries. Orphaned staged uploads are still
  // reachable via "Wipe pending uploads" in Config — which, since the M7 fix,
  // now refuses to run while any job is actively processing.
  setJobStatus(job.id, "failed", lastError?.message || "Unknown error");
  return job;
}

// Pick a safe timestamp for thumbnail extraction. Previously this was
// hardcoded to 20s in, which silently failed (no thumbnail, no error surfaced
// to the user) for any clip shorter than 20 seconds. Uses the source
// duration from probeData when available, otherwise falls back to 1s.
function pickThumbnailTimestamp(probeData) {
  const duration = parseFloat(probeData?.format?.duration);
  if (!duration || isNaN(duration) || duration <= 0) return "00:00:01";
  // Aim for the 20s mark, but stay well before the end of short clips.
  const target = Math.min(20, duration * 0.9);
  const seconds = Math.max(1, Math.floor(target));
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function runSingleAttempt(job, { inputPath, outputPath, thumbnailPath, probeData, options }) {
  const { quality, selectedAudioIndexes, selectedSubtitleIndexes, srtEntries } = options;

  // Reset job state for this attempt
  resetJob(job.id);
  setJobStatus(job.id, "running");

  appendLog(job.id, `[FFmpeg] Starting conversion: ${inputPath}`);
  appendLog(job.id, `[FFmpeg] Output: ${outputPath}`);
  appendLog(job.id, `[FFmpeg] Quality: ${quality}, Audio tracks: ${selectedAudioIndexes.length || "all"}, Subs: ${selectedSubtitleIndexes.length || "none"}, External SRTs: ${srtEntries.length}`);

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath);

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

    // Embedded subtitle mapping — filter out bitmap subtitles (PGS/HDMV) that can't be converted to mov_text
    const textSubCodecs = ["subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text", "sami", "jacosub", "microdvd", "mpl2", "pjs", "realtext", "stl", "subviewer", "subviewer1", "vplayer", "dvb_subtitle"];
    let textSubCount = 0;
    if (selectedSubtitleIndexes.length > 0) {
      for (const absIdx of selectedSubtitleIndexes) {
        const relIdx = subStreams.findIndex(s => s.index === absIdx);
        if (relIdx >= 0) {
          const subStream = subStreams[relIdx];
          if (textSubCodecs.includes(subStream.codec_name)) {
            mapOpts.push("-map", `0:s:${relIdx}?`);
            textSubCount++;
          } else {
            appendLog(job.id, `[FFmpeg] Skipping bitmap subtitle #${absIdx} (${subStream.codec_name}) — cannot convert to mov_text`);
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
    const preset = getQualityPresets()[quality];
    const ENCODING = getEncodingSettings();
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
    appendLog(job.id, `[FFmpeg] Args: ${allOpts.join(" ")}`);

    cmd.outputOptions(allOpts).save(outputPath);

    cmd.on("stderr", (line) => {
      appendLog(job.id, `[FFmpeg] ${line}`);
    });

    cmd.on("progress", (info) => {
      if (info.percent) {
        setJobProgress(job.id, info.percent);
        appendLog(job.id, `[FFmpeg] Progress: ${info.percent.toFixed(1)}% — Speed: ${info.currentFps || "?"} fps — Time: ${info.timemark}`);
      }
    });

    cmd.on("end", () => {
      appendLog(job.id, `[FFmpeg] Conversion complete: ${outputPath}`);
      // Generate thumbnail
      const thumbTimestamp = pickThumbnailTimestamp(probeData);
      ffmpeg(outputPath)
        .outputOptions(["-ss", thumbTimestamp, "-vframes", "1", "-q:v", "3", "-vf", "scale=300:-1"])
        .save(thumbnailPath)
        .on("end", () => {
          appendLog(job.id, "[FFmpeg] Thumbnail generated successfully!");
          try {
            fs.unlinkSync(inputPath);
            appendLog(job.id, `[FFmpeg] Original file removed: ${inputPath}`);
          } catch (err) {
            appendLog(job.id, `[FFmpeg] File removal failed: ${err.message}`);
          }
          resolve();
        })
        .on("error", (err) => {
          appendLog(job.id, `[FFmpeg] Thumbnail generation at ${thumbTimestamp} failed: ${err.message}`);
          // Fall back to grabbing the very first frame — this should succeed
          // for essentially any playable video, regardless of duration.
          ffmpeg(outputPath)
            .outputOptions(["-ss", "00:00:00", "-vframes", "1", "-q:v", "3", "-vf", "scale=300:-1"])
            .save(thumbnailPath)
            .on("end", () => {
              appendLog(job.id, "[FFmpeg] Thumbnail generated from first frame (fallback).");
              try { fs.unlinkSync(inputPath); } catch (_) {}
              resolve();
            })
            .on("error", (fallbackErr) => {
              appendLog(job.id, `[FFmpeg] Fallback thumbnail generation also failed: ${fallbackErr.message}`);
              try { fs.unlinkSync(inputPath); } catch (_) {}
              resolve();
            });
        });
    });

    cmd.on("error", (err) => {
      appendLog(job.id, `[FFmpeg] Conversion FAILED: ${err.message}`);
      reject(err);
    });

    // Track the underlying process for kill/restart support
    try {
      const proc = cmd._ffmpegProc;
      if (proc) setJobProcess(job.id, proc);
    } catch (_) {}
  });
}

/**
 * Restart a failed/stalled/cancelled job.
 * Returns as soon as the restart has been kicked off (job status "running"),
 * without waiting for the conversion to actually finish — the caller (the
 * /api/job/:id/restart route) needs to respond right away so the frontend's
 * existing SSE subscription keeps receiving progress. See runFfmpegJob() for
 * the same reasoning.
 * @param {string} jobId
 * @returns {Promise<object|null>} The job, or null if not found
 */
export async function restartJob(jobId) {
  const job = getJob(jobId);
  if (!job) return null;
  if (job.status === "running") return job;

  const { inputPath, outputPath, thumbnailPath, options } = job.payload;
  if (!fs.existsSync(inputPath)) {
    appendLog(job.id, "[ERROR] Staged file no longer exists. Cannot restart.");
    setJobStatus(job.id, "failed", "Staged file no longer exists");
    return job;
  }

  // Re-probe the file (it may have changed) — fast enough to do before responding
  const probeData = await new Promise((res) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) { res(null); return; }
      res(meta);
    });
  });

  appendLog(job.id, "[RESTART] Manual restart requested by user.");
  resetJob(job.id);
  setJobStatus(job.id, "running");

  runSingleAttempt(job, { inputPath, outputPath, thumbnailPath, probeData, options })
    .then(() => job.databaseAdd(job))
    .then(() => setJobStatus(job.id, "completed"))
    .catch((err) => {
      appendLog(job.id, `[ERROR] ${err.message}`);
      if (job.status !== "cancelled") setJobStatus(job.id, "failed", err.message);
    });

  return job;
}

/**
 * Cancel a running job.
 * @param {string} jobId
 */
export function cancelJob(jobId) {
  const job = getJob(jobId);
  if (!job) return null;
  if (job.status === "running") {
    appendLog(job.id, "[CANCEL] Job cancelled by user.");
    killJobProcess(jobId);
    setJobStatus(job.id, "cancelled");
  }
  return job;
}