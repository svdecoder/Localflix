import { EventEmitter } from "events";
import crypto from "crypto";

const jobs = new Map();
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

// If a running job produces no progress for this long, mark it as stalled
const STALL_TIMEOUT_MS = 120000; // 2 minutes
const STALL_CHECK_INTERVAL_MS = 15000;

export function createJob(type, payload) {
  const id = crypto.randomUUID();
  const job = {
    id,
    type,
    payload,
    status: "queued", // queued | running | completed | failed | cancelled | stalled
    progress: 0,
    log: [],
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    process: null,
    lastProgressAt: Date.now(),
    stalled: false,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id);
}

export function getJobPublic(id) {
  const job = jobs.get(id);
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    error: job.error,
    log: job.log,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    stalled: job.stalled,
  };
}

export function appendLog(jobId, line) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.log.push(line);
  // Cap log size to prevent unbounded memory growth
  if (job.log.length > 3000) job.log.splice(0, job.log.length - 3000);
  emitter.emit("log", jobId, line);
}

export function setJobStatus(jobId, status, error = null) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = status;
  job.error = error;
  if (status === "running") {
    job.startedAt = Date.now();
    job.lastProgressAt = Date.now();
    job.stalled = false;
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    job.finishedAt = Date.now();
  }
  emitter.emit("status", jobId, status);
}

export function setJobProgress(jobId, progress) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress = progress;
  job.lastProgressAt = Date.now();
  job.stalled = false;
  emitter.emit("progress", jobId, progress);
}

export function setJobProcess(jobId, process) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.process = process;
}

export function killJobProcess(jobId) {
  const job = jobs.get(jobId);
  if (job?.process) {
    try { job.process.kill(); } catch (_) {}
    job.process = null;
  }
}

export function resetJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.log = [];
  job.progress = 0;
  job.error = null;
  job.stalled = false;
  job.status = "queued";
  job.startedAt = null;
  job.finishedAt = null;
  job.process = null;
  job.lastProgressAt = Date.now();
}

export function cleanupJob(jobId) {
  jobs.delete(jobId);
}

export function subscribe(jobId, handlers) {
  const { onLog, onStatus, onProgress } = handlers;
  const logHandler = (id, line) => { if (id === jobId) onLog?.(line); };
  const statusHandler = (id, status) => { if (id === jobId) onStatus?.(status); };
  const progressHandler = (id, progress) => { if (id === jobId) onProgress?.(progress); };
  emitter.on("log", logHandler);
  emitter.on("status", statusHandler);
  emitter.on("progress", progressHandler);
  return () => {
    emitter.off("log", logHandler);
    emitter.off("status", statusHandler);
    emitter.off("progress", progressHandler);
  };
}

// Watchdog: mark running jobs as stalled if no progress for STALL_TIMEOUT_MS
setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === "running" && !job.stalled && now - job.lastProgressAt > STALL_TIMEOUT_MS) {
      job.stalled = true;
      appendLog(job.id, "[WARNING] No progress detected for 2 minutes. The process may be stuck. You can restart it manually.");
      emitter.emit("status", job.id, "stalled");
    }
  }
}, STALL_CHECK_INTERVAL_MS);