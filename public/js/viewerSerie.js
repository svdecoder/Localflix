async function fetchApi() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showError("No episode ID provided");
    return null;
  }
  try {
    const response = await fetch(`/api/dataEpisode?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Error fetching episode:", err);
    showError("Failed to load episode data");
    return null;
  }
}

function showError(msg) {
  const el = document.getElementById("videoInformation");
  if (el) el.innerHTML = `<div class="error-message">${escapeHtml(msg)}</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDuration(minutes) {
  if (!minutes) return "Unknown";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ===== Sidecar subtitle helpers (shared shape with viewerMovie.js) =====

const SUBTITLE_LANGUAGES = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"],
  ["it", "Italian"], ["pt", "Portuguese"], ["ru", "Russian"], ["ja", "Japanese"],
  ["ko", "Korean"], ["zh", "Chinese"], ["ar", "Arabic"], ["hi", "Hindi"],
];

function vttTimeToMs(t) {
  // WebVTT allows omitting the hours component when it's zero (ffmpeg's own
  // SRT→VTT conversion does exactly this — confirmed by testing it directly:
  // "00:01.000" rather than "00:00:01.000"), so both MM:SS.mmm and
  // HH:MM:SS.mmm need to be accepted here.
  const m = t.match(/^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return 0;
  const [, h, mi, s, ms] = m;
  return (parseInt(h || "0", 10) * 3600 + parseInt(mi, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10);
}

function msToVttTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000); ms %= 3600000;
  const m = Math.floor(ms / 60000); ms %= 60000;
  const s = Math.floor(ms / 1000); ms %= 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

// Shift every timestamp in a WebVTT file by offsetMs (can be negative).
// This is the whole mechanism that lets subtitle sync be adjusted without
// re-encoding anything — the shift happens client-side, on demand, against
// the stored .vtt file's raw text. Always emits full HH:MM:SS.mmm timestamps
// (valid WebVTT, and accepted by every browser) regardless of which form the
// source used.
function shiftVttTimestamps(vttText, offsetMs) {
  if (!offsetMs) return vttText;
  return vttText.replace(/(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/g, (match) => msToVttTime(vttTimeToMs(match) + offsetMs));
}

/**
 * Fetches sidecar subtitles for a media item, renders them as extra <track>
 * elements on the video (tagged data-sidecar="1" so they're distinguishable
 * from embedded tracks), adds matching <option>s to the subtitle selector,
 * and renders a management panel (list + offset controls + delete + add-new)
 * into panelEl.
 */
async function setupSidecarSubtitles(mediaType, mediaId, video, subtitleSelect, panelEl) {
  let subtitles = [];
  const blobUrls = new Map(); // subtitle id -> current blob URL, for revocation

  async function fetchList() {
    try {
      const resp = await fetch(`/api/subtitles?mediaType=${mediaType}&mediaId=${encodeURIComponent(mediaId)}`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (e) {
      return [];
    }
  }

  async function buildBlobUrl(sub) {
    const resp = await fetch(`/data/subtitles/${sub.storagePath}`);
    const text = await resp.text();
    const shifted = shiftVttTimestamps(text, sub.offsetMs);
    const url = URL.createObjectURL(new Blob([shifted], { type: "text/vtt" }));
    const old = blobUrls.get(sub.id);
    if (old) URL.revokeObjectURL(old);
    blobUrls.set(sub.id, url);
    return url;
  }

  async function rebuildTracksAndOptions() {
    const previousSelection = subtitleSelect.value;

    video.querySelectorAll('track[data-sidecar="1"]').forEach((t) => t.remove());
    subtitleSelect.querySelectorAll('option[data-sidecar="1"]').forEach((o) => o.remove());

    for (const sub of subtitles) {
      const url = await buildBlobUrl(sub);
      const trackEl = document.createElement("track");
      trackEl.kind = "subtitles";
      trackEl.src = url;
      trackEl.label = `${(sub.language || "und").toUpperCase()} — ${sub.originalFilename || "subtitle"}`;
      trackEl.dataset.key = `sidecar:${sub.id}`;
      trackEl.dataset.sidecar = "1";
      video.appendChild(trackEl);

      const opt = document.createElement("option");
      opt.value = `sidecar:${sub.id}`;
      opt.dataset.sidecar = "1";
      const offsetLabel = sub.offsetMs ? ` (${sub.offsetMs > 0 ? "+" : ""}${sub.offsetMs}ms)` : "";
      opt.textContent = `${(sub.language || "und").toUpperCase()} — ${sub.originalFilename || "subtitle"}${offsetLabel}`;
      subtitleSelect.appendChild(opt);
    }

    const stillExists = Array.from(subtitleSelect.options).some((o) => o.value === previousSelection);
    subtitleSelect.value = stillExists ? previousSelection : "off";
    subtitleSelect.dispatchEvent(new Event("change"));
  }

  function renderPanel() {
    const listHtml = subtitles.length === 0
      ? `<p style="color:var(--text-muted);font-size:0.85rem;">No subtitles added yet.</p>`
      : subtitles.map((sub) => `
        <div class="subtitle-row" style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-bottom:6px;flex-wrap:wrap;">
          <span style="min-width:40px;font-weight:600;">${escapeHtml((sub.language || "und").toUpperCase())}</span>
          <span style="color:var(--text-muted);flex:1;min-width:120px;">${escapeHtml(sub.originalFilename || "subtitle.srt")}</span>
          <span style="min-width:80px;text-align:right;">${sub.offsetMs > 0 ? "+" : ""}${sub.offsetMs} ms</span>
          <button type="button" class="sub-btn sub-offset-btn" data-id="${sub.id}" data-delta="-500">-500</button>
          <button type="button" class="sub-btn sub-offset-btn" data-id="${sub.id}" data-delta="-100">-100</button>
          <button type="button" class="sub-btn sub-offset-btn" data-id="${sub.id}" data-delta="100">+100</button>
          <button type="button" class="sub-btn sub-offset-btn" data-id="${sub.id}" data-delta="500">+500</button>
          <button type="button" class="sub-btn sub-reset-btn" data-id="${sub.id}">Reset</button>
          <button type="button" class="sub-btn sub-delete-btn" data-id="${sub.id}" style="color:var(--danger);">Delete</button>
        </div>
      `).join("");

    panelEl.innerHTML = `
      <div class="subtitle-panel">
        <h4 style="margin-bottom:8px;">Subtitles</h4>
        ${listHtml}
        <div class="subtitle-add-row" style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <input type="file" accept=".srt" id="sidecarSrtInput" style="max-width:220px;">
          <select id="sidecarLangSelect" style="max-width:130px;">
            ${SUBTITLE_LANGUAGES.map(([code, label]) => `<option value="${code}">${label}</option>`).join("")}
            <option value="other">Other…</option>
          </select>
          <input type="text" id="sidecarLangOther" placeholder="code" maxlength="20" style="width:60px;display:none;">
          <button type="button" id="sidecarAddBtn" class="sub-btn">Add Subtitle</button>
          <span id="sidecarAddStatus" style="font-size:0.8rem;color:var(--text-muted);"></span>
        </div>
      </div>
    `;

    panelEl.querySelectorAll(".sub-offset-btn").forEach((btn) => {
      btn.addEventListener("click", () => adjustOffset(parseInt(btn.dataset.id, 10), parseInt(btn.dataset.delta, 10)));
    });
    panelEl.querySelectorAll(".sub-reset-btn").forEach((btn) => {
      btn.addEventListener("click", () => setOffset(parseInt(btn.dataset.id, 10), 0));
    });
    panelEl.querySelectorAll(".sub-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteSubtitleEntry(parseInt(btn.dataset.id, 10)));
    });

    const langSelect = panelEl.querySelector("#sidecarLangSelect");
    const langOther = panelEl.querySelector("#sidecarLangOther");
    langSelect.addEventListener("change", () => {
      langOther.style.display = langSelect.value === "other" ? "inline-block" : "none";
    });
    panelEl.querySelector("#sidecarAddBtn").addEventListener("click", handleAddSubtitle);
  }

  async function adjustOffset(id, delta) {
    const sub = subtitles.find((s) => s.id === id);
    if (!sub) return;
    await setOffset(id, sub.offsetMs + delta);
  }

  async function setOffset(id, newOffsetMs) {
    try {
      const resp = await fetch(`/api/subtitles/${id}/offset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offsetMs: newOffsetMs }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || "Failed to update offset");
      const updated = await resp.json();
      const idx = subtitles.findIndex((s) => s.id === id);
      if (idx >= 0) subtitles[idx] = updated;
      await rebuildTracksAndOptions();
      renderPanel();
    } catch (err) {
      alert("Failed to adjust subtitle offset: " + err.message);
    }
  }

  async function deleteSubtitleEntry(id) {
    if (!confirm("Delete this subtitle?")) return;
    try {
      const resp = await fetch(`/api/subtitles/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error((await resp.json()).error || "Delete failed");
      subtitles = subtitles.filter((s) => s.id !== id);
      const url = blobUrls.get(id);
      if (url) { URL.revokeObjectURL(url); blobUrls.delete(id); }
      await rebuildTracksAndOptions();
      renderPanel();
    } catch (err) {
      alert("Failed to delete subtitle: " + err.message);
    }
  }

  async function handleAddSubtitle() {
    const fileInput = panelEl.querySelector("#sidecarSrtInput");
    const langSelect = panelEl.querySelector("#sidecarLangSelect");
    const langOther = panelEl.querySelector("#sidecarLangOther");
    const statusEl = panelEl.querySelector("#sidecarAddStatus");
    const file = fileInput.files[0];
    if (!file) { statusEl.textContent = "Choose a .srt file first."; return; }

    const language = langSelect.value === "other" ? (langOther.value.trim() || "und") : langSelect.value;

    statusEl.textContent = "Uploading...";
    try {
      const fd = new FormData();
      fd.append("srt", file);
      const uploadResp = await fetch("/api/uploadSrt", { method: "POST", body: fd });
      if (!uploadResp.ok) throw new Error((await uploadResp.json()).error || "Upload failed");
      const staged = await uploadResp.json();

      const attachResp = await fetch("/api/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType, mediaId,
          language,
          srtFile: staged.srtFile,
          originalName: staged.originalName,
        }),
      });
      if (!attachResp.ok) throw new Error((await attachResp.json()).error || "Failed to attach subtitle");
      const newSub = await attachResp.json();
      subtitles.push(newSub);
      await rebuildTracksAndOptions();
      renderPanel();
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
    }
  }

  subtitles = await fetchList();
  await rebuildTracksAndOptions();
  renderPanel();
}

// ===== Video compression panel (Task 3) =====
// Fetches a cheap probe-only analysis, shows current size/codec/estimate,
// and lets the user trigger a real compression job with live progress —
// reusing the exact same job-log/progress SSE mechanism the upload pages
// use (/api/job/:id/stream), just wired up locally here rather than via a
// shared import, consistent with how this file already duplicates small
// helpers (escapeHtml, SUBTITLE_LANGUAGES, etc.) instead of importing them.
async function setupCompressionPanel(mediaType, mediaId, panelEl) {
  let currentJobId = null;
  let eventSource = null;

  function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(1);
  }

  function renderLoading() {
    panelEl.innerHTML = `
      <div class="subtitle-panel">
        <h4 style="margin-bottom:8px;">Compression</h4>
        <p style="color:var(--text-muted);font-size:0.85rem;">Checking current file size and codec...</p>
      </div>
    `;
  }

  function renderAnalysis(analysis) {
    const recommendedText = analysis.recommended
      ? `<span style="color:var(--success);">Recommended</span> — estimated savings ~${analysis.estimatedSavingsPercent}%`
      : `<span style="color:var(--text-muted);">Not recommended</span> — already efficiently compressed`;

    panelEl.innerHTML = `
      <div class="subtitle-panel">
        <h4 style="margin-bottom:8px;">Compression</h4>
        <div style="font-size:0.85rem;line-height:1.8;">
          <div>Current size: <strong>${formatMB(analysis.sizeBytes)} MB</strong></div>
          <div>Codec: <strong>${escapeHtml(analysis.codec)}</strong> — Resolution: <strong>${escapeHtml(analysis.resolution)}</strong></div>
          <div>${recommendedText}</div>
          <p style="color:var(--text-muted);margin-top:4px;">${escapeHtml(analysis.reason)}</p>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="sub-btn" id="compressBtn">Compress ${analysis.recommended ? "Now" : "Anyway"}</button>
          <span id="compressStatusText" style="font-size:0.8rem;color:var(--text-muted);"></span>
        </div>
        <div id="compressJobContainer" style="margin-top:12px;"></div>
      </div>
    `;

    panelEl.querySelector("#compressBtn").addEventListener("click", () => {
      // force=true bypasses the "savings below minimum threshold" skip —
      // but never the "result is actually bigger" check, which the backend
      // enforces unconditionally regardless of force. Still worth an
      // explicit confirmation here, since the user is choosing to spend
      // time/CPU on a re-encode that isn't expected to help much.
      if (!analysis.recommended) {
        const proceed = confirm(
          "This file already looks efficiently compressed, so compressing it is unlikely to save much space — and if the result isn't smaller, the original will be kept automatically either way. Continue anyway?"
        );
        if (!proceed) return;
      }
      startCompression(!analysis.recommended);
    });
  }

  function renderError(message) {
    panelEl.innerHTML = `
      <div class="subtitle-panel">
        <h4 style="margin-bottom:8px;">Compression</h4>
        <p style="color:var(--danger);font-size:0.85rem;">${escapeHtml(message)}</p>
      </div>
    `;
  }

  async function loadAnalysis() {
    renderLoading();
    try {
      const resp = await fetch(`/api/compress/${mediaType}/${encodeURIComponent(mediaId)}/analyze`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to analyze file");
      }
      const analysis = await resp.json();
      renderAnalysis(analysis);
    } catch (err) {
      renderError(err.message);
    }
  }

  function jobTerminalHtml() {
    return `
      <div class="job-terminal">
        <div class="job-terminal-header">
          <span class="job-terminal-title">Compression Job</span>
          <span class="job-terminal-status queued" id="compressStatusBadge">queued</span>
          <div class="job-terminal-actions">
            <button type="button" class="job-terminal-btn cancel" id="compressCancelBtn">✕ Cancel</button>
          </div>
        </div>
        <div class="job-terminal-progress">
          <div class="job-terminal-progress-bar" id="compressProgressBar" style="width:0%"></div>
        </div>
        <div class="job-terminal-body" id="compressTerminalBody"></div>
      </div>
    `;
  }

  async function startCompression(force) {
    const container = panelEl.querySelector("#compressJobContainer");
    const btn = panelEl.querySelector("#compressBtn");
    const statusText = panelEl.querySelector("#compressStatusText");
    if (btn) btn.disabled = true;
    if (statusText) statusText.textContent = "Starting...";

    try {
      const resp = await fetch(`/api/compress/${mediaType}/${encodeURIComponent(mediaId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start compression");
      }
      const data = await resp.json();
      currentJobId = data.jobId;
      if (statusText) statusText.textContent = "";
      container.innerHTML = jobTerminalHtml();
      wireJobTerminal();
    } catch (err) {
      if (statusText) statusText.textContent = "Error: " + err.message;
      if (btn) btn.disabled = false;
    }
  }

  function wireJobTerminal() {
    const statusBadge = panelEl.querySelector("#compressStatusBadge");
    const progressBar = panelEl.querySelector("#compressProgressBar");
    const terminalBody = panelEl.querySelector("#compressTerminalBody");
    const cancelBtn = panelEl.querySelector("#compressCancelBtn");

    function appendLine(line) {
      const div = document.createElement("div");
      div.className = "job-terminal-line";
      div.textContent = line;
      terminalBody.appendChild(div);
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }

    function describeSizeChange(savingsPercent) {
      // savingsPercent is positive when smaller, negative when bigger.
      // Previously this always said "smaller" regardless of sign, so a file
      // that got bigger printed a confusing/wrong message like
      // "-30% smaller" instead of clearly saying it got larger.
      if (savingsPercent >= 0) return `${savingsPercent}% smaller`;
      return `${Math.abs(savingsPercent)}% LARGER`;
    }

    function setStatus(status, result) {
      statusBadge.textContent = status;
      statusBadge.className = "job-terminal-status " + status;
      cancelBtn.style.display = status === "running" || status === "queued" ? "inline-block" : "none";

      if (status === "completed" && result) {
        if (result.skipped) {
          if (result.reason === "not_smaller") {
            appendLine(`[RESULT] Skipped — the compressed version would have been ${describeSizeChange(result.wouldBeSavingsPercent)}, so the original file was kept. This is never overridden, even with "force".`);
          } else {
            appendLine(`[RESULT] Skipped — savings would only have been ${describeSizeChange(result.wouldBeSavingsPercent)}, original file kept.`);
          }
        } else {
          appendLine(`[RESULT] Done — ${formatMB(result.originalSizeBytes)} MB → ${formatMB(result.newSizeBytes)} MB (${describeSizeChange(result.savingsPercent)}).`);
        }
        // Refresh the analysis panel above so the displayed size reflects
        // the new file once the job finishes.
        setTimeout(loadAnalysis, 2000);
      }
    }

    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/job/${currentJobId}/stream`);
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "snapshot") {
          const job = msg.job;
          (job.log || []).forEach(appendLine);
          progressBar.style.width = Math.min(100, Math.max(0, job.progress || 0)) + "%";
          setStatus(job.status, job.result);
        } else if (msg.type === "log") {
          appendLine(msg.line);
        } else if (msg.type === "status") {
          setStatus(msg.status, msg.result);
        } else if (msg.type === "progress") {
          progressBar.style.width = Math.min(100, Math.max(0, msg.progress)) + "%";
        }
      } catch (_) {}
    };

    cancelBtn.addEventListener("click", async () => {
      if (!currentJobId) return;
      try {
        await fetch(`/api/job/${currentJobId}/cancel`, { method: "POST" });
        appendLine("[CANCEL] Cancellation requested.");
      } catch (err) {
        appendLine("[ERROR] " + err.message);
      }
    });
  }

  await loadAnalysis();
}

async function domInserter() {
  const dataObject = await fetchApi();
  if (!dataObject || !dataObject.length) {
    showError("Episode not found");
    return;
  }

  const ep = dataObject[0];
  const id = new URLSearchParams(window.location.search).get("id");
  const serie = ep.serie_id;
  const streamUrl = `/stream/serie/${encodeURIComponent(serie)}/${encodeURIComponent(id)}`;

  // Fetch track info BEFORE building the video HTML so <track> elements
  // are present from the start — browsers need this for proper TextTrack init.
  let trackData = { audio: [], subtitles: [] };
  try {
    const resp = await fetch(`/api/videoTracks?path=data/serie/${encodeURIComponent(serie)}/${encodeURIComponent(id)}.mp4`);
    if (resp.ok) trackData = await resp.json();
  } catch (e) {
    console.log("Could not load track info:", e);
  }

  // Build <track> HTML strings for embedded subtitles. data-key uniquely
  // identifies each track regardless of source (embedded stream vs sidecar
  // .vtt file) so the subtitle selector can't accidentally confuse an
  // embedded stream's ffprobe index with a sidecar subtitle's DB id.
  let trackHtml = "";
  for (const s of trackData.subtitles || []) {
    const lang = s.language !== "und" ? ` srclang="${escapeAttr(s.language)}"` : "";
    const label = escapeAttr(s.title || `Sub ${s.index}`);
    trackHtml += `<track kind="subtitles" src="/api/subtitle?path=data/serie/${encodeURIComponent(serie)}/${encodeURIComponent(id)}.mp4&index=${s.index}"${lang} label="${label}" data-key="embedded:${s.index}">`;
  }

  // Build audio select options
  let audioOptions = "";
  if (trackData.audio && trackData.audio.length >= 1) {
    for (let i = 0; i < trackData.audio.length; i++) {
      const a = trackData.audio[i];
      const lang = a.language !== "und" ? ` [${a.language}]` : "";
      const selected = i === 0 ? " selected" : "";
      // data-position is the audio track's position among audio streams only
      // (0-based) — this lines up with the browser's video.audioTracks list,
      // which is what we actually need to switch tracks (a.index is the
      // absolute ffprobe stream index, not usable here).
      audioOptions += `<option value="${a.index}" data-position="${i}"${selected}>Audio: ${escapeHtml(a.title || "Track " + a.index)}${lang}</option>`;
    }
  } else {
    audioOptions = `<option value="">Audio: None detected</option>`;
  }

  // Build subtitle select options (embedded tracks only here — sidecar
  // subtitles are added dynamically once fetched, see setupSidecarSubtitles)
  let subOptions = '<option value="off">Subs: Off</option>';
  if (trackData.subtitles && trackData.subtitles.length > 0) {
    for (const s of trackData.subtitles) {
      const lang = s.language !== "und" ? ` [${s.language}]` : "";
      subOptions += `<option value="embedded:${s.index}">${escapeHtml(s.title || "Sub " + s.index)}${lang}</option>`;
    }
  }

  // Video player with custom controls — <track> elements baked into initial HTML
  document.getElementById("videoDisplay").innerHTML = `
    <div class="video-player-wrapper">
      <video id="video" crossorigin="anonymous" preload="metadata">
        <source src="${streamUrl}" type="video/mp4">
        ${trackHtml}
        Your browser does not support the video tag.
      </video>
      <div class="video-controls-overlay" id="customControls">
        <div class="progress-container" id="progressContainer">
          <div class="progress-bar" id="progressBar"></div>
          <div class="progress-buffered" id="bufferBar"></div>
          <div class="progress-hover-tooltip" id="progressTooltip">0:00</div>
        </div>
        <div class="controls-row">
          <button class="ctrl-btn" id="playPauseBtn" title="Play/Pause (Space)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="ctrl-btn" id="skipBackBtn" title="Skip back 10s (←)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 5V1l-5 5 5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h-2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
          </button>
          <button class="ctrl-btn" id="skipFwdBtn" title="Skip forward 10s (→)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM18 6v12h2V6h-2z"/></svg>
          </button>
          <button class="ctrl-btn" id="muteBtn" title="Mute/Unmute (M)">
            <svg id="muteIcon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          </button>
          <button class="ctrl-btn" id="boostBtn" title="Volume boost: 100% (B)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            <span class="boost-label" id="boostLabel">100%</span>
          </button>
          <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
          <div class="spacer"></div>
          <div class="controls-group">
            <div class="select-wrapper" id="audioSelectWrapper">
              <svg class="select-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              <select id="audioTrackSelect" class="track-select" title="Audio track">
                ${audioOptions}
              </select>
            </div>
            <div class="select-wrapper" id="subSelectWrapper">
              <svg class="select-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg>
              <select id="subtitleTrackSelect" class="track-select" title="Subtitles">
                ${subOptions}
              </select>
            </div>
          </div>
          <button class="ctrl-btn" id="fullscreenBtn" title="Fullscreen (F)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Episode info
  document.getElementById("videoInformation").innerHTML = `
    <div class="videoInformations" id="episodeInfoContainer">
      <div class="info-header">
        <h2 class="movie-title">${escapeHtml(ep.title)}</h2>
        <button id="editEpisodeBtn" class="btn-edit" title="Edit episode information">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Edit
        </button>
      </div>
      <div id="episodeInfoDisplay">
        <div class="info-grid">
          <div class="info-row"><span class="preceding-info">Series</span><span class="value">${escapeHtml(serie)}</span></div>
          <div class="info-row"><span class="preceding-info">Season</span><span class="value">${ep.season || "?"}</span></div>
          <div class="info-row"><span class="preceding-info">Episode</span><span class="value">${ep.episode || "?"}</span></div>
          <div class="info-row"><span class="preceding-info">Duration</span><span class="value">${formatDuration(ep.length_minutes)}</span></div>
          <div class="info-row"><span class="preceding-info">Released</span><span class="value">${formatDate(ep.date)}</span></div>
        </div>
        <div class="info-description">
          <span class="preceding-info">Description</span>
          <p>${escapeHtml(ep.description || "No description")}</p>
        </div>
      </div>
    </div>
    <div id="subtitlePanel" style="max-width:1100px;margin:16px auto;padding:0 24px;"></div>
    <div id="compressionPanel" style="max-width:1100px;margin:16px auto;padding:0 24px;"></div>
  `;

  // Initialize edit functionality
  initEpisodeEdit(ep, id);

  initVideoControls(id, serie);

  // Sidecar subtitles (uploaded .srt files converted to .vtt with an
  // adjustable sync offset) — separate from the embedded tracks handled by
  // initVideoControls, since they're fetched from a different API and
  // rendered as dynamically-added <track> elements.
  const videoEl = document.getElementById("video");
  const subtitleSelectEl = document.getElementById("subtitleTrackSelect");
  const subtitlePanelEl = document.getElementById("subtitlePanel");
  if (videoEl && subtitleSelectEl && subtitlePanelEl) {
    setupSidecarSubtitles("episode", id, videoEl, subtitleSelectEl, subtitlePanelEl);
  }

  const compressionPanelEl = document.getElementById("compressionPanel");
  if (compressionPanelEl) {
    setupCompressionPanel("episode", id, compressionPanelEl);
  }
}

function initEpisodeEdit(ep, id) {
  const editBtn = document.getElementById("editEpisodeBtn");
  const container = document.getElementById("episodeInfoContainer");
  const display = document.getElementById("episodeInfoDisplay");
  if (!editBtn || !container || !display) return;

  editBtn.addEventListener("click", () => {
    // Build editable form
    display.innerHTML = `
      <div class="edit-form">
        <div class="edit-field">
          <label for="editTitle">Title</label>
          <input type="text" id="editTitle" value="${escapeAttr(ep.title || "")}" maxlength="255">
        </div>
        <div class="edit-field">
          <label for="editSeason">Season</label>
          <input type="number" id="editSeason" value="${escapeAttr(ep.season || "")}" min="1">
        </div>
        <div class="edit-field">
          <label for="editEpisode">Episode</label>
          <input type="number" id="editEpisode" value="${escapeAttr(ep.episode || "")}" min="1">
        </div>
        <div class="edit-field">
          <label for="editDate">Release Date (YYYY-MM-DD)</label>
          <input type="text" id="editDate" value="${escapeAttr(ep.date || "")}" placeholder="2024-01-15" maxlength="10">
        </div>
        <div class="edit-field">
          <label for="editDescription">Description</label>
          <textarea id="editDescription" maxlength="255" rows="4">${escapeHtml(ep.description || "")}</textarea>
        </div>
        <div class="edit-actions">
          <button id="saveEpisodeBtn" class="btn-submit btn-save">Save</button>
          <button id="cancelEpisodeBtn" class="btn-cancel">Cancel</button>
        </div>
        <div id="editStatus" class="edit-status"></div>
      </div>
    `;

    editBtn.style.display = "none";

    const saveBtn = document.getElementById("saveEpisodeBtn");
    const cancelBtn = document.getElementById("cancelEpisodeBtn");
    const statusEl = document.getElementById("editStatus");

    cancelBtn.addEventListener("click", () => {
      // Re-render the display view
      display.innerHTML = `
        <div class="info-grid">
          <div class="info-row"><span class="preceding-info">Series</span><span class="value">${escapeHtml(ep.serie_id || "?")}</span></div>
          <div class="info-row"><span class="preceding-info">Season</span><span class="value">${ep.season || "?"}</span></div>
          <div class="info-row"><span class="preceding-info">Episode</span><span class="value">${ep.episode || "?"}</span></div>
          <div class="info-row"><span class="preceding-info">Duration</span><span class="value">${formatDuration(ep.length_minutes)}</span></div>
          <div class="info-row"><span class="preceding-info">Released</span><span class="value">${formatDate(ep.date)}</span></div>
        </div>
        <div class="info-description">
          <span class="preceding-info">Description</span>
          <p>${escapeHtml(ep.description || "No description")}</p>
        </div>
      `;
      editBtn.style.display = "flex";
    });

    saveBtn.addEventListener("click", async () => {
      const updated = {
        title: document.getElementById("editTitle").value.trim(),
        season: document.getElementById("editSeason").value.trim(),
        episode: document.getElementById("editEpisode").value.trim(),
        date: document.getElementById("editDate").value.trim(),
        description: document.getElementById("editDescription").value.trim(),
      };

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      statusEl.className = "edit-status processing";
      statusEl.textContent = "Saving changes...";

      try {
        const resp = await fetch(`/api/episode/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || "Save failed");
        }

        // Update local episode object
        Object.assign(ep, updated);

        statusEl.className = "edit-status success";
        statusEl.textContent = "Changes saved successfully!";

        // Re-render display view
        setTimeout(() => {
          display.innerHTML = `
            <div class="info-grid">
              <div class="info-row"><span class="preceding-info">Series</span><span class="value">${escapeHtml(ep.serie_id || "?")}</span></div>
              <div class="info-row"><span class="preceding-info">Season</span><span class="value">${ep.season || "?"}</span></div>
              <div class="info-row"><span class="preceding-info">Episode</span><span class="value">${ep.episode || "?"}</span></div>
              <div class="info-row"><span class="preceding-info">Duration</span><span class="value">${formatDuration(ep.length_minutes)}</span></div>
              <div class="info-row"><span class="preceding-info">Released</span><span class="value">${formatDate(ep.date)}</span></div>
            </div>
            <div class="info-description">
              <span class="preceding-info">Description</span>
              <p>${escapeHtml(ep.description || "No description")}</p>
            </div>
          `;
          // Update the title in the header
          const titleEl = container.querySelector(".movie-title");
          if (titleEl) titleEl.textContent = ep.title;
          editBtn.style.display = "flex";
        }, 800);
      } catch (err) {
        statusEl.className = "edit-status error";
        statusEl.textContent = "Failed to save: " + err.message;
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    });
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "\u0026amp;")
    .replace(/"/g, "\u0026quot;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;");
}

function initVideoControls(episodeId, serieTitle) {
  const video = document.getElementById("video");
  if (!video) return;

  const playPauseBtn = document.getElementById("playPauseBtn");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipFwdBtn = document.getElementById("skipFwdBtn");
  const muteBtn = document.getElementById("muteBtn");
  const muteIcon = document.getElementById("muteIcon");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const bufferBar = document.getElementById("bufferBar");
  const progressTooltip = document.getElementById("progressTooltip");
  const timeDisplay = document.getElementById("timeDisplay");
  const audioSelect = document.getElementById("audioTrackSelect");
  const subtitleSelect = document.getElementById("subtitleTrackSelect");
  const wrapper = video.closest(".video-player-wrapper");

  // ===== Controls auto-hide/show =====
  let hideTimeout = null;
  let clickTimer = null;

  function showControls() {
    if (wrapper) wrapper.classList.remove("controls-hidden");
    scheduleHide();
  }

  function hideControls() {
    if (wrapper) wrapper.classList.add("controls-hidden");
  }

  function scheduleHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!video.paused) hideControls();
    }, 3000);
  }

  function cancelHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (wrapper) {
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen();
      } else if (wrapper.webkitRequestFullscreen) {
        wrapper.webkitRequestFullscreen();
      } else if (wrapper.mozRequestFullScreen) {
        wrapper.mozRequestFullScreen();
      }
    }
  }

  // Ensure video is not muted on load
  video.muted = false;
  video.volume = 1.0;

  // Subtitle track selection — enable the chosen track on the video element.
  // Works for both embedded tracks (data-key="embedded:<ffprobe index>")
  // and sidecar subtitles (data-key="sidecar:<subtitle db id>").
  function applySubtitleTrack() {
    const selectedKey = subtitleSelect.value;
    const tracks = video.querySelectorAll("track");
    for (const trackEl of tracks) {
      const isSelected = selectedKey !== "off" && trackEl.dataset.key === selectedKey;
      if (trackEl.track) {
        trackEl.track.mode = isSelected ? "showing" : "disabled";
      }
    }
  }
  subtitleSelect.addEventListener("change", applySubtitleTrack);

  // Audio track selection — HTMLMediaElement.audioTracks is only supported
  // in Chromium-based browsers (Chrome, Edge, Opera). Firefox and Safari have
  // no API to switch embedded audio tracks client-side, so on those browsers
  // we disable the selector rather than silently doing nothing.
  if (audioSelect && audioSelect.options.length > 1) {
    if ("audioTracks" in video) {
      function applyAudioTrack() {
        const selectedOption = audioSelect.options[audioSelect.selectedIndex];
        const position = parseInt(selectedOption?.dataset.position, 10);
        if (isNaN(position) || !video.audioTracks) return;
        for (let i = 0; i < video.audioTracks.length; i++) {
          video.audioTracks[i].enabled = i === position;
        }
      }
      // audioTracks may populate asynchronously once metadata loads
      video.addEventListener("loadedmetadata", applyAudioTrack, { once: true });
      audioSelect.addEventListener("change", applyAudioTrack);
    } else {
      audioSelect.disabled = true;
      audioSelect.title = "Switching audio tracks isn't supported in this browser (try Chrome or Edge)";
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatTimeLong(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function updatePlayPauseIcon() {
    if (video.paused) {
      playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    } else {
      playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
  }

  function updateMuteIcon() {
    if (video.muted || video.volume === 0) {
      muteIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else {
      muteIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  // Play/Pause
  playPauseBtn.addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    updatePlayPauseIcon();
  });

  video.addEventListener("play", () => {
    updatePlayPauseIcon();
    scheduleHide();
  });
  video.addEventListener("pause", () => {
    updatePlayPauseIcon();
    cancelHide();
    showControls();
  });

  // Click video to toggle play/pause (single click, delayed to avoid double-click conflict)
  video.addEventListener("click", (e) => {
    if (e.detail === 1) {
      clickTimer = window.setTimeout(() => {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        updatePlayPauseIcon();
      }, 220);
    }
  });

  // Double-click video to toggle fullscreen
  video.addEventListener("dblclick", (e) => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    e.preventDefault();
    toggleFullscreen();
  });

  // Mute/Unmute
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    updateMuteIcon();
  });
  video.addEventListener("volumechange", updateMuteIcon);

  // ===== Volume Boost (Web Audio API) =====
  // HTML5 video volume is capped at 1.0 (100%). To go beyond that like VLC,
  // we route the video's audio through a GainNode that can amplify up to 200%.
  const boostBtn = document.getElementById("boostBtn");
  const boostLabel = document.getElementById("boostLabel");
  const BOOST_LEVELS = [1.0, 1.25, 1.5, 1.75, 2.0];
  let boostIndex = 0;
  let audioCtx = null;
  let gainNode = null;
  let sourceNode = null;

  function setupBoostGraph() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = BOOST_LEVELS[boostIndex];
      gainNode.connect(audioCtx.destination);
    }
    if (!sourceNode) {
      try {
        sourceNode = audioCtx.createMediaElementSource(video);
        sourceNode.connect(gainNode);
      } catch (e) {
        // createMediaElementSource can only be called once per element.
        // If it fails, boost is unavailable for this session.
        console.warn("Volume boost unavailable:", e);
      }
    }
  }

  function applyBoost() {
    boostIndex = (boostIndex + 1) % BOOST_LEVELS.length;
    const level = BOOST_LEVELS[boostIndex];
    const pct = Math.round(level * 100);
    boostLabel.textContent = `${pct}%`;
    boostBtn.title = `Volume boost: ${pct}% (B)`;
    boostBtn.classList.toggle("boost-active", level > 1.0);
    if (gainNode) {
      gainNode.gain.value = level;
    }
  }

  boostBtn.addEventListener("click", () => {
    setupBoostGraph();
    applyBoost();
  });

  // Keyboard shortcut: B to cycle boost
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "b" || e.key === "B") {
      setupBoostGraph();
      applyBoost();
    }
  });

  // Skip buttons
  skipBackBtn.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwdBtn.addEventListener("click", () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
  });

  fullscreenBtn.addEventListener("click", toggleFullscreen);

  // Track fullscreen changes
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      const wrapper = video.closest(".video-player-wrapper");
      if (wrapper) {
        wrapper.style.width = "";
        wrapper.style.height = "";
      }
    }
    showControls();
  });

  // Reappear controls on mouse movement over the player
  if (wrapper) {
    wrapper.addEventListener("mousemove", showControls);
    wrapper.addEventListener("mouseenter", showControls);
    wrapper.addEventListener("mouseleave", () => {
      if (!video.paused) hideControls();
    });
  }

  // Show controls initially
  showControls();

  // Progress bar with hover tooltip
  video.addEventListener("timeupdate", () => {
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      progressBar.style.width = `${pct}%`;
      timeDisplay.textContent = `${formatTimeLong(video.currentTime)} / ${formatTimeLong(video.duration)}`;
    }
  });

  // Buffer progress
  video.addEventListener("progress", () => {
    if (video.buffered.length > 0 && video.duration) {
      const buffered = video.buffered.end(video.buffered.length - 1);
      const pct = (buffered / video.duration) * 100;
      bufferBar.style.width = `${pct}%`;
    }
  });

  // Hover tooltip on progress bar
  progressContainer.addEventListener("mousemove", (e) => {
    if (!video.duration) return;
    const rect = progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * video.duration;
    progressTooltip.textContent = formatTimeLong(seekTime);
    progressTooltip.style.left = `${e.clientX - rect.left}px`;
    progressTooltip.style.opacity = "1";
  });
  progressContainer.addEventListener("mouseleave", () => {
    progressTooltip.style.opacity = "0";
  });

  // Click to seek
  progressContainer.addEventListener("click", (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
  });

  // Update the time display when video metadata is ready.
  video.addEventListener("loadedmetadata", () => {
    timeDisplay.textContent = `0:00 / ${formatTimeLong(video.duration)}`;
  });

  // ===== Keyboard Shortcuts =====
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    showControls();
    switch (e.key) {
      case " ":
        e.preventDefault();
        video.paused ? video.play().catch(() => {}) : video.pause();
        updatePlayPauseIcon();
        break;
      case "ArrowLeft":
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case "ArrowRight":
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "m":
      case "M":
        video.muted = !video.muted;
        updateMuteIcon();
        break;
    }
  });

  // ===== Video Load Error Handling =====
  video.addEventListener("error", () => {
    const error = video.error;
    let msg = "Failed to load video. ";
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED: msg += "Playback aborted."; break;
        case MediaError.MEDIA_ERR_NETWORK: msg += "Network error — check your connection."; break;
        case MediaError.MEDIA_ERR_DECODE: msg += "Decoding error — the file may be corrupted."; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          msg += "Video format not supported or file not found. The video file may not have been processed correctly.";
          break;
        default: msg += "Unknown error.";
      }
    }
    msg += " Please try re-uploading the video via the Add page.";
    showError(msg);
  });

  // ===== Delete Episode =====
  const deleteBtn = document.getElementById("deleteEpisodeBtn");
  if (deleteBtn) {
    deleteBtn.style.display = "block";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this episode? This action cannot be undone.")) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting...";

      try {
        const resp = await fetch(`/api/episode/${encodeURIComponent(episodeId)}`, { method: "DELETE" });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Delete failed");
        }
        // Return to the series' episode list rather than the homepage,
        // since that's the natural place to land after deleting one episode.
        window.location.href = serieTitle ? `/serieDisplay?id=${encodeURIComponent(serieTitle)}` : "/";
      } catch (err) {
        alert("Failed to delete episode: " + err.message);
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete Episode";
      }
    });
  }
}

domInserter();