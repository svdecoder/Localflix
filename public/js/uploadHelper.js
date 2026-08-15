// Shared upload + job tracking helpers for add-movie and add-episode pages

const CHUNK_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_CHUNK_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 1000;

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export async function uploadVideoWithRetry(file, { onProgress = () => {}, onStatus = () => {}, uploadId = null } = {}) {
  if (!uploadId) {
    uploadId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  let receivedChunks = [];
  try {
    const statusResp = await fetch(`/api/uploadStatus?uploadId=${encodeURIComponent(uploadId)}`);
    if (statusResp.ok) {
      const status = await statusResp.json();
      receivedChunks = status.receivedChunks || [];
    }
  } catch (_) {}

  const receivedSet = new Set(receivedChunks);
  if (receivedSet.size > 0) {
    onStatus(`Resuming upload — ${receivedSet.size}/${totalChunks} chunks already received...`);
  }

  for (let i = 0; i < totalChunks; i++) {
    if (receivedSet.has(i)) {
      onProgress(Math.round(((i + 1) / totalChunks) * 100), i + 1, totalChunks);
      continue;
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      try {
        const resp = await fetch("/api/chunkUpload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-upload-id": uploadId,
            "x-chunk-index": String(i),
            "x-total-chunks": String(totalChunks),
            "x-original-name": encodeURIComponent(file.name),
          },
          body: chunk,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Chunk upload failed" }));
          throw new Error(err.error || "Chunk upload failed");
        }
        success = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_CHUNK_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          onStatus(`Chunk ${i + 1}/${totalChunks} failed (${err.message}). Retrying in ${delay / 1000}s... (attempt ${attempt}/${MAX_CHUNK_RETRIES})`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (!success) {
      throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${MAX_CHUNK_RETRIES} attempts: ${lastError?.message || "Unknown error"}`);
    }

    receivedSet.add(i);
    onProgress(Math.round(((i + 1) / totalChunks) * 100), i + 1, totalChunks);
  }

  onStatus("Assembling and analyzing video...");
  const assembleResp = await fetch("/api/chunkAssemble", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, originalName: file.name }),
  });
  if (!assembleResp.ok) {
    const err = await assembleResp.json().catch(() => ({ error: "Assembly failed" }));
    throw new Error(err.error || "Assembly failed");
  }
  const data = await assembleResp.json();
  return { uploadId, ...data };
}

export function submitAndTrackJob(form, { onJobCreated = () => {}, onLog = () => {}, onStatus = () => {}, onProgress = () => {}, onComplete = () => {}, onError = () => {} }) {
  const formData = new FormData(form);
  fetch(form.action, { method: "POST", body: formData })
    .then(async (resp) => {
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to start processing" }));
        throw new Error(err.error || "Failed to start processing");
      }
      const data = await resp.json();
      if (!data.jobId) throw new Error("No job ID returned from server");
      onJobCreated(data.jobId);
      trackJob(data.jobId, { onLog, onStatus, onProgress, onComplete, onError });
    })
    .catch((err) => onError(err.message || "Failed to start processing"));
}

export function trackJob(jobId, { onLog = () => {}, onStatus = () => {}, onProgress = () => {}, onComplete = () => {}, onError = () => {} }) {
  const es = new EventSource(`/api/job/${jobId}/stream`);
  es.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "snapshot") {
        const job = msg.job;
        (job.log || []).forEach((line) => onLog(line));
        onProgress(job.progress || 0);
        onStatus(job.status);
        if (job.status === "completed") onComplete(job);
        if (job.status === "failed") onError(job.error || "Job failed");
      } else if (msg.type === "log") {
        onLog(msg.line);
      } else if (msg.type === "status") {
        onStatus(msg.status);
        if (msg.status === "completed") onComplete();
        if (msg.status === "failed") onError("Job failed");
      } else if (msg.type === "progress") {
        onProgress(msg.progress);
      }
    } catch (_) {}
  };
  es.onerror = () => {};
  return es;
}

export async function restartJob(jobId) {
  const resp = await fetch(`/api/job/${jobId}/restart`, { method: "POST" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Failed to restart job" }));
    throw new Error(err.error || "Failed to restart job");
  }
  return resp.json();
}

export async function cancelJob(jobId) {
  const resp = await fetch(`/api/job/${jobId}/cancel`, { method: "POST" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Failed to cancel job" }));
    throw new Error(err.error || "Failed to cancel job");
  }
  return resp.json();
}

export function createTerminalView() {
  const container = document.createElement("div");
  container.className = "job-terminal";
  container.style.display = "none";
  container.innerHTML = `
    <div class="job-terminal-header">
      <span class="job-terminal-title">FFmpeg Process</span>
      <span class="job-terminal-status" id="jobStatusBadge">queued</span>
      <div class="job-terminal-actions">
        <button type="button" class="job-terminal-btn restart" id="jobRestartBtn" style="display:none;">↻ Restart</button>
        <button type="button" class="job-terminal-btn cancel" id="jobCancelBtn" style="display:none;">✕ Cancel</button>
      </div>
    </div>
    <div class="job-terminal-progress">
      <div class="job-terminal-progress-bar" id="jobProgressBar" style="width:0%"></div>
    </div>
    <div class="job-terminal-body" id="jobTerminalBody"></div>
  `;
  return container;
}