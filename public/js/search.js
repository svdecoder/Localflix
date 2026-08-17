async function apiRequest(specifications, request) {
    try {
        const response = await fetch(`/api/search?request=${request}&specification=${specifications}`);
        if (!response.ok) {
            throw new Error(`The fetch went wrong: ${response.status}`);
        }
        return await response.json();
    } catch(err) {
        console.log(`Something went wrong: ${err}`);
        return [];
    }
}

function formHandling() {
    const request = document.getElementById('request').value;
    const specifications = document.querySelector('input[name="specification"]:checked')?.value;
    return apiRequest(specifications, request);
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderTags(tags) {
    if (!tags) return "";
    return `<span class="tag-list">` + String(tags)
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => `<span class="tag-bubble">${escapeHtml(t)}</span>`)
        .join("") + `</span>`;
}

async function resultInserter() {
    const data = await formHandling();
    console.log(data);
    const resultsContainer = document.getElementById("results");
    resultsContainer.innerHTML = ""; 
    let html = ""; 
    for (let i = 0; i < data.length; i++) {
        const object = data[i];
        const title = object.title;
        const tags = object.tags;
        const description = object.description;
        const author = object.author;
        const mode = object.type === "movie" ? "viewerM" : "serieDisplay";
        const thumbnail = `/data/thumbnail/${escapeAttr(object.identifier)}.jpg`;
        html += `
        <div class="result">
            <a href="/${mode}?id=${encodeURIComponent(object.identifier)}" class="elementVideo">
                <img src="${thumbnail}" alt="Thumbnail didn't load" class="videoButtonImage"><br>
                <div class="info">
                <div class="title">Title: ${escapeHtml(title)}</div>
                <div class="description">Description: ${escapeHtml(description)}</div>
                <div class="author">Author: ${escapeHtml(author)}</div>
                <div class="tag">Tags: ${renderTags(tags)}</div>
                </div>
            </a>
        </div>`;
    }
    resultsContainer.innerHTML = html;
}

const form = document.getElementById('searchForm');
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await resultInserter();
});
