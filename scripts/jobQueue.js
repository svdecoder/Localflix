// Minimal in-process FIFO queue for expensive ffmpeg encode jobs.
//
// Per the spec: "By default, run one expensive encoding job at a time.
// Queue additional jobs. Do not allow several large encodes to overload the
// server." Without this, runFfmpegJob() and restartJob() would each start
// ffmpeg the instant they're called, so two uploads finishing probe around
// the same time would run two full encodes concurrently — exactly the kind
// of CPU contention that turns a slow encode into a failed one on modest
// self-hosted hardware.
//
// This is deliberately simple (no persistence, no priority, no multi-process
// workers) — it's an in-memory FIFO, which is consistent with the rest of
// the job system (jobManager.js is also purely in-memory). The concurrency
// limit is configurable via MAX_CONCURRENT_ENCODES for anyone running on
// hardware that can actually handle more than one encode at once; the
// queue's FIFO structure itself doesn't change if that's raised, so this
// can be extended to real multi-worker processing later without a rewrite.

const MAX_CONCURRENT_ENCODES = Math.max(1, parseInt(process.env.MAX_CONCURRENT_ENCODES, 10) || 1);

let active = 0;
const queue = [];

function pump() {
  if (active >= MAX_CONCURRENT_ENCODES) return;
  const next = queue.shift();
  if (!next) return;
  active++;
  Promise.resolve()
    .then(next)
    .catch((err) => {
      console.error("[JobQueue] Unhandled task error:", err);
    })
    .finally(() => {
      active--;
      pump();
    });
}

/**
 * Enqueue an async task (e.g. a full ffmpeg retry run for one job). Tasks
 * run strictly FIFO, at most MAX_CONCURRENT_ENCODES at a time. Does not
 * return a promise tied to the task's completion — callers here (ffmpegJob.js)
 * are already fire-and-forget by design (see runFfmpegJob's own comment on
 * why it can't block the HTTP response).
 */
export function enqueue(task) {
  queue.push(task);
  pump();
}

export function getQueueDepth() {
  return queue.length;
}

export function getActiveCount() {
  return active;
}
