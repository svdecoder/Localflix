async function fetchApi(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`The fetch went wrong: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (err) {
    console.error(`Something went wrong: ${err}`);
  }
}

function domInserter(dataArray, seasonNumber, titleOfSerie) {
  let epOfASeason = `
  <div class="EpisodesOfASeason">
    <span class="season">Season ${seasonNumber}</span>
    <div class="video-grid">`
  let cartToInsert = ''
  for (let i = 0; i < dataArray.length; i++) {
    console.log(dataArray[i])
    const {identifier, episode, season, description, date, createdAt, serieId, title} = dataArray[i];
    let thumbnail = `/data/thumbnail/${titleOfSerie}/${identifier}.jpg`
    cartToInsert += `
      <div class="elementVideo-wrapper" style="position:relative;">
        <a href="/viewerS?id=${identifier}" class="video-link">
        <div class="elementVideo">
          <img src="${thumbnail}" onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';" class="videoButtonImage">
        <span class="title">${title}</span>
        <span class="description">${description}</span>
        <span class="information">Episode number ${episode} from season ${seasonNumber}</span>
      </div>
      </a>
      <button type="button" class="episode-delete-btn" data-id="${identifier}" title="Delete this episode" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;border:1px solid var(--danger);background:rgba(0,0,0,0.6);color:var(--danger);cursor:pointer;line-height:1;font-size:16px;">×</button>
    </div>`
  }
      document.getElementById("EpisodesDisplay").innerHTML +=epOfASeason + cartToInsert + "</div></div>"

};

async function handler() {
  const title = new URLSearchParams(window.location.search).get('id');
  seriesData = await fetchApi(`/api/dataSerie?title=${title}`);
  numberOfSeasons = seriesData[0].number_of_seasons;
  for (season = 1; season <= numberOfSeasons; season++) {
    episodes = await fetchApi(`/api/dataEpisodes?title=${title}&season=${season}`);
    domInserter(episodes, season, title);
  }
}

handler();

// Delete a single episode — delegated so it works for episodes rendered after page load
document.getElementById("EpisodesDisplay").addEventListener("click", async (e) => {
  const btn = e.target.closest(".episode-delete-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const id = btn.dataset.id;
  if (!id) return;
  if (!confirm("Are you sure you want to delete this episode? This cannot be undone.")) return;

  btn.disabled = true;
  btn.textContent = "…";

  try {
    const resp = await fetch(`/api/episode/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Delete failed");
    }
    btn.closest(".elementVideo-wrapper")?.remove();
  } catch (err) {
    alert("Failed to delete episode: " + err.message);
    btn.disabled = false;
    btn.textContent = "×";
  }
});

// Delete Series button
const deleteBtn = document.getElementById("deleteSerieBtn");
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    const title = new URLSearchParams(window.location.search).get("id");
    if (!title) return;
    if (!confirm(`Are you sure you want to delete "${title}" and ALL its episodes? This cannot be undone.`)) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";

    try {
      const resp = await fetch(`/api/serie/${encodeURIComponent(title)}`, { method: "DELETE" });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Delete failed");
      }
      window.location.href = "/";
    } catch (err) {
      alert("Failed to delete series: " + err.message);
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete Series";
    }
  });
}