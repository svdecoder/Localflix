// ===== Config Page JavaScript =====

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

// Format watch time: show minutes when under an hour, otherwise show hours with one decimal
function formatWatchHours(hours) {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes + " min";
  }
  return hours.toFixed(1) + " h";
}

// ===== Monitoring Studio =====
async function loadStats() {
  try {
    const resp = await fetch("/api/stats");
    if (!resp.ok) throw new Error("Failed to fetch stats");
    const data = await resp.json();

    document.getElementById("statTotalDisk").textContent = formatBytes(data.disk.total);
    document.getElementById("diskMovies").textContent = formatBytes(data.disk.movies);
    document.getElementById("diskSeries").textContent = formatBytes(data.disk.series);
    document.getElementById("diskThumbnails").textContent = formatBytes(data.disk.thumbnails);
    document.getElementById("diskUploads").textContent = formatBytes(data.disk.uploads);

    document.getElementById("statMovies").textContent = data.counts.movies;
    document.getElementById("statSeries").textContent = data.counts.series;
    document.getElementById("statEpisodes").textContent = data.counts.episodes;
    document.getElementById("statTotalVideos").textContent = data.counts.totalVideos;
    document.getElementById("statPending").textContent = data.counts.pending;

    document.getElementById("statWatchHours").textContent = formatWatchHours(data.stats.totalWatchHours);
    document.getElementById("statTags").textContent = data.stats.uniqueTags;
    document.getElementById("statNewThisWeek").textContent =
      data.stats.newMoviesThisWeek + data.stats.newSeriesThisWeek;
  } catch (err) {
    console.error("Error loading stats:", err);
    document.querySelectorAll(".stat-main").forEach(el => el.textContent = "—");
  }
}

// ===== Wipe Space =====
function showWipeStatus(message, type) {
  const status = document.getElementById("wipeStatus");
  status.textContent = message;
  status.className = "wipe-status active " + type;
}

async function wipeTarget(target) {
  const labels = { movies: "all movies", series: "all series", uploads: "all pending uploads", all: "EVERYTHING" };
  const label = labels[target] || target;

  const confirmMsg = target === "all"
    ? "DANGER: This will permanently delete ALL movies, series, episodes, thumbnails, and pending uploads. This cannot be undone. Are you absolutely sure?"
    : `Are you sure you want to permanently delete ${label}? This cannot be undone.`;

  if (!confirm(confirmMsg)) return;

  if (target === "all") {
    if (!confirm("FINAL WARNING: This is a complete factory reset. All your content will be lost forever. Continue?")) return;
  }

  showWipeStatus(`Deleting ${label}...`, "processing");

  try {
    const resp = await fetch("/api/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Wipe failed" }));
      throw new Error(err.error || "Wipe failed");
    }
    showWipeStatus(`Successfully deleted ${label}.`, "success");
    setTimeout(loadStats, 500);
  } catch (err) {
    showWipeStatus(`Error: ${err.message}`, "error");
  }
}

// ===== FFmpeg Preset Config =====
let ffmpegConfig = null;
let currentPresetKey = "1080p";

// This is a client-side fallback only, used if /api/ffmpegConfig can't be
// reached — it can't literally share code with the server (browser vs
// Node), so it's a plain copy. The single source of truth for the actual
// defaults is scripts/ffmpegConfig.js's DEFAULT_CONFIG; keep this in sync
// with that if the presets ever change.
const DEFAULT_CONFIG = {
  presets: {
    "480p": { scale: "854:480", videoBitrate: "1000k", maxrate: "1200k", bufsize: "2000k" },
    "720p": { scale: "1280:720", videoBitrate: "2500k", maxrate: "3000k", bufsize: "5000k" },
    "1080p": { scale: "1920:1080", videoBitrate: "5000k", maxrate: "6000k", bufsize: "10000k" },
    "1440p": { scale: "2560:1440", videoBitrate: "8000k", maxrate: "10000k", bufsize: "16000k" },
    "original": null
  },
  encoding: {
    preset: "fast", crf: "23", pix_fmt: "yuv420p", movflags: "+faststart",
    audioCodec: "aac", audioChannels: "2", subtitleCodec: "mov_text"
  }
};

async function loadFfmpegConfig() {
  try {
    const resp = await fetch("/api/ffmpegConfig");
    if (!resp.ok) throw new Error("Failed to fetch ffmpeg config");
    ffmpegConfig = await resp.json();
    populateFfmpegForm();
  } catch (err) {
    console.error("Error loading ffmpeg config:", err);
    ffmpegConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    populateFfmpegForm();
  }
}

function populateFfmpegForm() {
  if (!ffmpegConfig) return;
  const enc = ffmpegConfig.encoding || {};
  document.getElementById("encPreset").value = enc.preset || "fast";
  document.getElementById("encCrf").value = enc.crf || "23";
  document.getElementById("encPixFmt").value = enc.pix_fmt || "yuv420p";
  document.getElementById("encMovflags").value = enc.movflags || "+faststart";
  document.getElementById("encAudioCodec").value = enc.audioCodec || "aac";
  document.getElementById("encAudioChannels").value = enc.audioChannels || "2";
  document.getElementById("encSubtitleCodec").value = enc.subtitleCodec || "mov_text";
  renderPresetTabs();
}

function renderPresetTabs() {
  const tabsContainer = document.getElementById("presetTabs");
  const presets = ffmpegConfig.presets || {};
  const keys = Object.keys(presets);

  tabsContainer.innerHTML = keys.map(key =>
    `<button class="preset-tab ${key === currentPresetKey ? "active" : ""}" data-preset="${key}">${key}</button>`
  ).join("");

  tabsContainer.querySelectorAll(".preset-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentPresetKey = tab.dataset.preset;
      renderPresetTabs();
      populatePresetEditor();
    });
  });

  populatePresetEditor();
}

function populatePresetEditor() {
  const presets = ffmpegConfig.presets || {};
  const preset = presets[currentPresetKey];
  const ids = ["presetScale", "presetVideoBitrate", "presetMaxrate", "presetBufsize"];
  const vals = preset ? [preset.scale, preset.videoBitrate, preset.maxrate, preset.bufsize] : ["", "", "", ""];

  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    el.value = vals[i] || "";
    el.disabled = !preset;
  });
}

function showFfmpegStatus(message, type) {
  const status = document.getElementById("ffmpegStatus");
  status.textContent = message;
  status.className = "ffmpeg-status active " + type;
}

async function saveFfmpegConfig() {
  if (!ffmpegConfig) return;

  const encoding = {
    preset: document.getElementById("encPreset").value,
    crf: document.getElementById("encCrf").value,
    pix_fmt: document.getElementById("encPixFmt").value,
    movflags: document.getElementById("encMovflags").value,
    audioCodec: document.getElementById("encAudioCodec").value,
    audioChannels: document.getElementById("encAudioChannels").value,
    subtitleCodec: document.getElementById("encSubtitleCodec").value,
  };

  const presets = ffmpegConfig.presets || {};
  const preset = presets[currentPresetKey];
  if (preset) {
    preset.scale = document.getElementById("presetScale").value;
    preset.videoBitrate = document.getElementById("presetVideoBitrate").value;
    preset.maxrate = document.getElementById("presetMaxrate").value;
    preset.bufsize = document.getElementById("presetBufsize").value;
  }

  const payload = { encoding, presets };
  showFfmpegStatus("Saving configuration...", "processing");

  try {
    const resp = await fetch("/api/ffmpegConfig", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Save failed" }));
      throw new Error(err.error || "Save failed");
    }
    ffmpegConfig = payload;
    showFfmpegStatus("Configuration saved successfully.", "success");
  } catch (err) {
    showFfmpegStatus(`Error: ${err.message}`, "error");
  }
}

async function resetFfmpegConfig() {
  if (!confirm("Reset FFmpeg configuration to default values?")) return;
  showFfmpegStatus("Resetting configuration...", "processing");

  try {
    const resp = await fetch("/api/ffmpegConfig/reset", { method: "POST" });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Reset failed" }));
      throw new Error(err.error || "Reset failed");
    }
    ffmpegConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    populateFfmpegForm();
    showFfmpegStatus("Configuration reset to defaults.", "success");
  } catch (err) {
    showFfmpegStatus(`Error: ${err.message}`, "error");
  }
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  loadFfmpegConfig();

  document.querySelectorAll(".btn-wipe").forEach(btn => {
    btn.addEventListener("click", () => wipeTarget(btn.dataset.target));
  });

  document.getElementById("saveFfmpegBtn").addEventListener("click", saveFfmpegConfig);
  document.getElementById("resetFfmpegBtn").addEventListener("click", resetFfmpegConfig);
});
