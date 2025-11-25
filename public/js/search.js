async function apiRequest(specifications, request, type) {
    try {
        const response = await fetch(`/api/search?request=${request}&specification=${specifications}`);
        if (!response.ok) {
            throw new Error(`The fetch went wrong: ${response.status}`)
        }
        const result = await response.json()
        return result} catch(err) {
            console.log(`something went wrong: ${err}`)
        }
};

function formHandling() {
  return new Promise((resolve) => {
    const form = document.getElementById('searchForm');
    form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = document.getElementById('request').value;
    const specifications = document.querySelector('input[name="specification"]:checked')?.value;
    const data = await apiRequest(specifications, request);
    resolve(data);
  });
  })

}


async function resultInserter () {
    let data = await formHandling();
    console.log(data)
    for (i in data) {
        let object = data[i]
        let title = object.title;
        let tags = object.tags;
        let description = object.description;
        let author = object.author;
        let mode = "null"
        if (object.type == 'movie') {mode = 'viewerM';} else {mode = 'serieDisplay';}

        let thumbnail = `/data/thumbnail/${object.identifier}.jpg`
        document.getElementById("results").innerHTML += `
        <div class="result">
            <a href="/${mode}?id=${object.identifier}">
                <button class="elementVideo">
                    <img src=${thumbnail} alt="Thumbnail didn't loaded" class="videoButtonImage"><br>
                    <span class="title">${title}</span><br>
                    <span class="description">${description}</span><br>
                    <span class="author">${author}</span><br>
                    <span class="tag">${tags}</span>
                </button>
            </a>
        </div>`
    }
}
resultInserter();