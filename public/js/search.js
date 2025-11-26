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
        const thumbnail = `/data/thumbnail/${object.identifier}.jpg`;
        html += `
        <div class="result">
            <a href="/${mode}?id=${object.identifier}" class="elementVideo">
                <img src="${thumbnail}" alt="Thumbnail didn't load" class="videoButtonImage"><br>
                <div class="info">
                <div class="title">Title: ${title}</div>
                <div class="description">Description: ${description}</div>
                <div class="author">Author: ${author}</div>
                <div class="tag">Tags: ${tags}</div>
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
