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
  if (el) el.innerHTML = `<div class="error-message">${msg}</div>`;
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

  // Video player
  document.getElementById("videoDisplay").innerHTML = `
    <div class="video-player-wrapper">
      <video id="video" controls crossorigin="anonymous" preload="metadata">
        <source src="${streamUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div class="video-controls-overlay" id="customControls">
        <div class="progress-container" id="progressContainer">
          <div class="progress-bar" id="progressBar"></div>
          <div class="progress-buffered" id="bufferBar"></div>
        </div>
        <div class="controls-row">
          <button class="ctrl-btn" id="playPauseBtn" title="Play/Pause">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
          <div class="spacer"></div>
          <button class="ctrl-btn" id="skipBackBtn" title="Skip back 10s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
          </button>
          <button class="ctrl-btn" id="skipFwdBtn" title="Skip forward 10s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" transform="scale(-1,1) translate(-24,0)"/></svg>
          </button>
          <button class="ctrl-btn" id="fullscreenBtn" title="Fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Episode info
  document.getElementById("videoInformation").innerHTML = `
    <div class="videoInformations">
      <h2 class="movie-title">${escapeHtml(ep.title)}</h2>
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
  `;

  initVideoControls();
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function initVideoControls() {
  const video = document.getElementById("video");
  if (!video) return;

  const playPauseBtn = document.getElementById("playPauseBtn");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipFwdBtn = document.getElementById("skipFwdBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const bufferBar = document.getElementById("bufferBar");
  const timeDisplay = document.getElementById("timeDisplay");

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  playPauseBtn.addEventListener("click", () => {
    if (video.paused) {
      video.play();
      playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    } else {
      video.pause();
      playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
  });

  video.addEventListener("play", () => {
    playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  });
  video.addEventListener("pause", () => {
    playPauseBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  });

  skipBackBtn.addEventListener("click", () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });
  skipFwdBtn.addEventListener("click", () => {
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
  });

  fullscreenBtn.addEventListener("click", () => {
    const wrapper = video.closest(".video-player-wrapper");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (wrapper) {
      wrapper.requestFullscreen();
    }
  });

  video.addEventListener("timeupdate", () => {
    if (video.duration) {
      const pct = (video.currentTime / video.duration) * 100;
      progressBar.style.width = `${pct}%`;
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  });

  video.addEventListener("progress", () => {
    if (video.buffered.length > 0 && video.duration) {
      const buffered = video.buffered.end(video.buffered.length - 1);
      const pct = (buffered / video.duration) * 100;
      bufferBar.style.width = `${pct}%`;
    }
  });

  progressContainer.addEventListener("click", (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case "ArrowLeft":
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;
      case "ArrowRight":
        video.currentTime = Math.min(video.duration, video.currentTime + 5);
        break;
      case "f":
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          const wrapper = video.closest(".video-player-wrapper");
          if (wrapper) wrapper.requestFullscreen();
        }
        break;
    }
  });

  video.addEventListener("loadedmetadata", () => {
    timeDisplay.textContent = `0:00 / ${formatTime(video.duration)}`;
  });
}

domInserter();