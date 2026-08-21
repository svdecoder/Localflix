// Shared primitives for any ffmpeg-based job (upload encoding, compression,
// or anything added later). Extracted out of ffmpegJob.js so compression
// (scripts/compressJob.js) gets the exact same safety guarantees — atomic
// writes, pre-flight disk checks, real output validation, plain-English
// failure diagnosis — instead of a second, drifting copy of this logic.

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { appendLog } from "./jobManager.js";

// Job-id-scoped temp path for a given final path — e.g.
// "/data/movies/abc.mp4" -> "/data/movies/.abc.mp4.tmp-<jobId>". Leading dot
// keeps it out of any directory listing that only shows non-hidden files.
// Scoping by job id means two attempts (or two different jobs) can never
// collide on the same temp file even if they somehow ran concurrently.
export function tempPathFor(finalPath, jobId) {
  const dir = path.dirname(finalPath);
  const base = path.basename(finalPath);
  return path.join(dir, `.${base}.tmp-${jobId}`);
}

// Check that there's enough free space on the filesystem holding
// outputDir before starting an encode, so a doomed-to-fail job fails fast
// with a clear reason instead of burning CPU time and then failing anyway
// partway through with a cryptic ffmpeg I/O error. Node's fs.statfsSync is
// available from v18.15+ (the Dockerfile uses node:18-alpine) but isn't
// universally supported on every platform/filesystem, so this fails open —
// if the check itself throws, we log it and proceed rather than blocking a
// job over a diagnostic that couldn't run.
export function checkDiskSpace(outputDir, requiredBytes, jobId) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const stats = fs.statfsSync(outputDir);
    const freeBytes = stats.bavail * stats.bsize;
    if (freeBytes < requiredBytes) {
      const freeMB = (freeBytes / 1024 / 1024).toFixed(0);
      const requiredMB = (requiredBytes / 1024 / 1024).toFixed(0);
      throw new Error(
        `Not enough disk space: ${freeMB}MB free, need at least ~${requiredMB}MB for this encode. Free up space or wipe old uploads before retrying.`
      );
    }
    appendLog(jobId, `[DiskCheck] ${(freeBytes / 1024 / 1024).toFixed(0)}MB free — sufficient.`);
  } catch (err) {
    if (err.message.startsWith("Not enough disk space")) throw err;
    // statfsSync unsupported/failed for some other reason — don't block the job over it.
    appendLog(jobId, `[DiskCheck] Could not check free disk space (${err.message}) — proceeding anyway.`);
  }
}

// Known failure signatures worth surfacing as a plain-English diagnosis
// instead of leaving the user to decode raw ffmpeg/OS error text.
const FAILURE_SIGNATURES = [
  { pattern: /no space left on device/i, diagnosis: "The disk ran out of space during encoding." },
  { pattern: /cannot allocate memory|out of memory/i, diagnosis: "The server ran out of memory during encoding." },
  { pattern: /permission denied/i, diagnosis: "A file permission error occurred — check that the app can write to its data directories." },
  { pattern: /\bkilled\b/i, diagnosis: "The ffmpeg process was killed, likely by the OS (often due to memory pressure)." },
  { pattern: /invalid data found when processing input/i, diagnosis: "The source file appears to be corrupt or in an unsupported format." },
  { pattern: /moov atom not found/i, diagnosis: "The source file is incomplete or corrupt (missing required MP4 metadata)." },
];

export function diagnoseFailure(message) {
  const match = FAILURE_SIGNATURES.find((sig) => sig.pattern.test(message));
  return match ? match.diagnosis : null;
}

// Validate a freshly-encoded file before it's ever renamed into its real,
// DB-referenced location. This is the core of "never mark a failed operation
// as successful" — ffmpeg firing its "end" event only means the process
// exited without error; it doesn't guarantee the resulting file is a valid,
// playable video with the expected duration (e.g. an ENOSPC mid-write with
// +faststart can still let the process exit in a way that looks clean).
export async function validateOutputFile(filePath, { requireDuration = true } = {}) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: "Output file does not exist after encoding" };
  }
  const size = fs.statSync(filePath).size;
  if (size === 0) {
    return { valid: false, reason: "Output file is empty (0 bytes)" };
  }
  if (!requireDuration) {
    // Thumbnails: existence + nonzero size is a sufficient check — no need
    // to ffprobe a JPEG for a "duration".
    return { valid: true, size };
  }

  const probeResult = await new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return resolve({ error: err.message });
      resolve({ meta });
    });
  });
  if (probeResult.error) {
    return { valid: false, reason: `Output file failed validation probe: ${probeResult.error}` };
  }
  const duration = parseFloat(probeResult.meta?.format?.duration);
  if (!duration || isNaN(duration) || duration <= 0) {
    return { valid: false, reason: "Output file has no readable duration — likely truncated or corrupt" };
  }
  return { valid: true, duration, size };
}
