async function fetchApi() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showError("No movie ID provided");
    return null;
  }
  try {
    const response = await fetch(`/api/dataMovie?id=${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("Error fetching movie:", err);
    showError("Failed to load movie data");
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

async function domInserter() {
  const dataObject = await fetchApi();
  if (!dataObject || !dataObject.length) {
    showError("Movie not found");
    return;
  }

  const movie = dataObject[0];
  const id = new URLSearchParams(window.location.search).get("id");
  const streamUrl = `/stream/movie/${encodeURIComponent(id)}`;
  const downloadUrl = streamUrl;

  // Video player with custom controls only (no native controls to avoid double viewer)
  document.getElementById("videoDisplay").innerHTML = `
    <div class="video-player-wrapper">
      <video id="video" crossorigin="anonymous" preload="metadata">
        <source src="${streamUrl}" type="video/mp4">
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
          <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
          <div class="spacer"></div>
          <div class="controls-group">
            <div class="select-wrapper" id="audioSelectWrapper" style="display:none;">
              <svg class="select-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              <select id="audioTrackSelect" class="track-select" title="Audio track">
                <option value="">Audio tracks</option>
              </select>
            </div>
            <div class="select-wrapper" id="subSelectWrapper" style="display:none;">
              <svg class="select-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg>
              <select id="subtitleTrackSelect" class="track-select" title="Subtitles">
                <option value="-1">Subtitles</option>
              </select>
            </div>
            <a id="downloadBtn" class="ctrl-btn download-btn" href="${downloadUrl}" download title="Download video">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </a>
          </div>
          <button class="ctrl-btn" id="fullscreenBtn" title="Fullscreen (F)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Movie info
  document.getElementById("videoInformation").innerHTML = `
    <div class="videoInformations">
      <h2 class="movie-title">${escapeHtml(movie.title)}</h2>
      <div class="info-grid">
        <div class="info-row"><span class="preceding-info">Author</span><span class="value">${escapeHtml(movie.author || "Unknown")}</span></div>
        <div class="info-row"><span class="preceding-info">Duration</span><span class="value">${formatDuration(movie.length_minutes)}</span></div>
        <div class="info-row"><span class="preceding-info">Released</span><span class="value">${formatDate(movie.release_date)}</span></div>
        <div class="info-row"><span class="preceding-info">Tags</span>${renderTags(movie.tags)}</div>
      </div>
      <div class="info-description">
        <span class="preceding-info">Description</span>
        <p>${escapeHtml(movie.description || "No description")}</p>
      </div>
    </div>
  `;

  // Initialize custom controls
  initVideoControls(id);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderTags(tags) {
  if (!tags || tags === "None") return '<span class="value">None</span>';
  return `<span class="tag-list">` + String(tags)
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => `<span class="tag-bubble">${escapeHtml(t)}</span>`)
    .join("") + `</span>`;
}

function initVideoControls(movieId) {
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
  const audioSelectWrapper = document.getElementById("audioSelectWrapper");
  const subtitleSelect = document.getElementById("subtitleTrackSelect");
  const subSelectWrapper = document.getElementById("subSelectWrapper");

  // Ensure video is not muted on load
  video.muted = false;
  video.volume = 1.0;

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

  video.addEventListener("play", updatePlayPauseIcon);
  video.addEventListener("pause", updatePlayPauseIcon);

  // Click video to toggle play/pause
  video.addEventListener("click", (e) => {
    if (e.detail === 1) {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      updatePlayPauseIcon();
    }
  });

  // Mute/Unmute
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    updateMuteIcon();
  });
  video.addEventListener("volumechange", updateMuteIcon);

  // Skip buttons
  skipBackBtn.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwdBtn.addEventListener("click", () => {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
  });

  // Fullscreen — request fullscreen on the wrapper element
  fullscreenBtn.addEventListener("click", () => {
    const wrapper = video.closest(".video-player-wrapper");
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
  });

  // Track fullscreen changes
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      // Exited fullscreen — restore wrapper styles
      const wrapper = video.closest(".video-player-wrapper");
      if (wrapper) {
        wrapper.style.width = "";
        wrapper.style.height = "";
      }
    }
  });

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

  // ===== Track Selectors via Probe API =====
  async function loadTrackInfo() {
    try {
      const resp = await fetch(`/api/videoTracks?path=data/movies/${encodeURIComponent(movieId)}.mp4`);
      if (!resp.ok) return;
      const data = await resp.json();

      // Populate audio select — ALWAYS show
      if (data.audio && data.audio.length >= 1) {
        audioSelect.innerHTML = "";
        for (let i = 0; i < data.audio.length; i++) {
          const a = data.audio[i];
          const lang = a.language !== "und" ? ` [${a.language}]` : "";
          const option = document.createElement("option");
          option.value = a.index;
          option.textContent = `Audio: ${a.title || "Track " + a.index}${lang}`;
          if (i === 0) option.selected = true;
          audioSelect.appendChild(option);
        }
        audioSelectWrapper.style.display = "flex";
      } else {
        // No audio tracks detected — still show a placeholder so user sees it
        audioSelect.innerHTML = `<option value="">Audio: None detected</option>`;
        audioSelectWrapper.style.display = "flex";
      }

      // Populate subtitle select — ALWAYS show
      if (data.subtitles && data.subtitles.length > 0) {
        subtitleSelect.innerHTML = '<option value="-1">Subs: Off</option>';
        for (const s of data.subtitles) {
          const lang = s.language !== "und" ? ` [${s.language}]` : "";
          const option = document.createElement("option");
          option.value = s.index;
          option.textContent = `${s.title || "Sub " + s.index}${lang}`;
          subtitleSelect.appendChild(option);
        }
        subSelectWrapper.style.display = "flex";
      } else {
        subtitleSelect.innerHTML = `<option value="-1">Subs: None detected</option>`;
        subSelectWrapper.style.display = "flex";
      }
    } catch (e) {
      console.log("Could not load track info:", e);
    }
  }

  // Load track info when video metadata is ready
  video.addEventListener("loadedmetadata", () => {
    timeDisplay.textContent = `0:00 / ${formatTimeLong(video.duration)}`;
    loadTrackInfo();
  });

  // ===== Keyboard Shortcuts =====
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
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
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          const wrapper = video.closest(".video-player-wrapper");
          if (wrapper) {
            if (wrapper.requestFullscreen) wrapper.requestFullscreen();
            else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
          }
        }
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

  // ===== Delete Movie =====
  const deleteBtn = document.getElementById("deleteMovieBtn");
  if (deleteBtn) {
    deleteBtn.style.display = "block";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this movie? This action cannot be undone.")) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting...";

      try {
        const resp = await fetch(`/api/movie/${encodeURIComponent(movieId)}`, { method: "DELETE" });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || "Delete failed");
        }
        window.location.href = "/";
      } catch (err) {
        alert("Failed to delete movie: " + err.message);
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete Movie";
      }
    });
  }
}

domInserter();