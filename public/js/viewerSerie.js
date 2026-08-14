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

  // Build <track> HTML strings for subtitles
  let trackHtml = "";
  for (const s of trackData.subtitles || []) {
    const lang = s.language !== "und" ? ` srclang="${escapeAttr(s.language)}"` : "";
    const label = escapeAttr(s.title || `Sub ${s.index}`);
    trackHtml += `<track kind="subtitles" src="/api/subtitle?path=data/serie/${encodeURIComponent(serie)}/${encodeURIComponent(id)}.mp4&index=${s.index}"${lang} label="${label}" data-index="${s.index}">`;
  }

  // Build audio select options
  let audioOptions = "";
  if (trackData.audio && trackData.audio.length >= 1) {
    for (let i = 0; i < trackData.audio.length; i++) {
      const a = trackData.audio[i];
      const lang = a.language !== "und" ? ` [${a.language}]` : "";
      const selected = i === 0 ? " selected" : "";
      audioOptions += `<option value="${a.index}"${selected}>Audio: ${escapeHtml(a.title || "Track " + a.index)}${lang}</option>`;
    }
  } else {
    audioOptions = `<option value="">Audio: None detected</option>`;
  }

  // Build subtitle select options
  let subOptions = '<option value="-1">Subs: Off</option>';
  if (trackData.subtitles && trackData.subtitles.length > 0) {
    for (const s of trackData.subtitles) {
      const lang = s.language !== "und" ? ` [${s.language}]` : "";
      subOptions += `<option value="${s.index}">${escapeHtml(s.title || "Sub " + s.index)}${lang}</option>`;
    }
  } else {
    subOptions = `<option value="-1">Subs: None detected</option>`;
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
  `;

  // Initialize edit functionality
  initEpisodeEdit(ep, id);

  initVideoControls();
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

function initVideoControls() {
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

  // Subtitle track selection — enable the chosen track on the video element
  function applySubtitleTrack() {
    const idx = parseInt(subtitleSelect.value, 10);
    const tracks = video.querySelectorAll("track");
    for (const trackEl of tracks) {
      let isSelected = false;
      if (idx !== -1 && trackEl.dataset.index === String(idx)) {
        isSelected = true;
      }
      if (trackEl.track) {
        trackEl.track.mode = isSelected ? "showing" : "disabled";
      }
    }
  }
  subtitleSelect.addEventListener("change", applySubtitleTrack);

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
}

domInserter();