let allMovies = [];

async function fetchCatalogue() {
  try {
    const response = await fetch("/api/catalogue");
    if (!response.ok) {
      throw new Error(`The fetch went wrong: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`Something went wrong: ${err}`);
    return [];
  }
}

function renderTags(tags) {
  if (!tags) return "";
  return `<span class="tag-list">` + String(tags)
    .split(",")
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => `<span class="tag-bubble">${t}</span>`)
    .join("") + `</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatLength(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function escapeHtml(str) {
  if (!str) return "";
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  const apos = "&#" + "039;";
  const map = {
    "&": amp,
    "<": lt,
    ">": gt,
    '"': quot,
    "'": apos
  };
  return String(str).replace(/[&<>"']/g, ch => map[ch]);
}

function renderMovieCard(movie) {
  const tid = String(movie.identifier || "").replace(/\s+/g, "");
  const thumbnail = `/data/thumbnail/${tid}.jpg`;
  const title = escapeHtml(movie.title);
  const author = escapeHtml(movie.author);
  const description = escapeHtml(movie.description);
  const releaseDate = formatDate(movie.release_date);
  const length = formatLength(movie.length_minutes);

  return `
  <a href="/viewerM?id=${encodeURIComponent(movie.identifier)}" class="catalogue-card">
    <div class="catalogue-card-thumbnail">
      <img src="${thumbnail}" alt="${title}" loading="lazy"
           onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';">
      ${length ? `<span class="catalogue-card-length">${length}</span>` : ""}
    </div>
    <div class="catalogue-card-body">
      <div class="catalogue-card-title">${title}</div>
      ${author ? `<div class="catalogue-card-author">${author}</div>` : ""}
      ${releaseDate ? `<div class="catalogue-card-date">${releaseDate}</div>` : ""}
      ${description ? `<div class="catalogue-card-description">${description}</div>` : ""}
      ${renderTags(movie.tags)}
    </div>
  </a>`;
}

function applyFiltersAndSort() {
  const searchTerm = document.getElementById("catalogueSearch").value.trim().toLowerCase();
  const sortBy = document.getElementById("sortSelect").value;

  let filtered = allMovies;

  if (searchTerm) {
    filtered = filtered.filter(movie => {
      const haystack = [
        movie.title,
        movie.author,
        movie.tags,
        movie.description
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  switch (sortBy) {
    case "newest":
      filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      break;
    case "oldest":
      filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      break;
    case "title-asc":
      filtered.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      break;
    case "title-desc":
      filtered.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
      break;
    case "author":
      filtered.sort((a, b) => String(a.author || "").localeCompare(String(b.author || "")));
      break;
  }

  const grid = document.getElementById("catalogueGrid");
  const empty = document.getElementById("catalogueEmpty");

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    grid.innerHTML = filtered.map(renderMovieCard).join("");
  }
}

async function initCatalogue() {
  allMovies = await fetchCatalogue();
  applyFiltersAndSort();

  document.getElementById("catalogueSearch").addEventListener("input", applyFiltersAndSort);
  document.getElementById("sortSelect").addEventListener("change", applyFiltersAndSort);
}

document.addEventListener("DOMContentLoaded", initCatalogue);