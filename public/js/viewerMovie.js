async function fetchApi() {
  const id = new URLSearchParams(window.location.search).get('id')
  try {
    const response = await fetch(`/api/dataMovie?id=${id}`);
    if (!response.ok) {
      throw new Error(`The fetch went wrong: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (err) {
    console.error(`Something went wrong: ${err}`);
  }
}

async function domInserter() {
    let dataObject = await fetchApi();
    let title = dataObject[0].title;
    let author = dataObject[0].author;
    let description = dataObject[0].description;
    let tags = dataObject[0].tags;
    let creationDate = dataObject[0].created_at;
    
    document.getElementById("videoInformation").innerHTML += `
<div class="videoInformations">
    <div class="info-row"><span class="preceding-info">Title:</span><span class="value">${title}</span></div>
    <div class="info-row"><span class="preceding-info">Authors:</span><span class="value">${author}</span></div>
    <div class="info-row"><span class="preceding-info">Description:</span><span class="value">${description}</span></div>
    <div class="info-row"><span class="preceding-info">Tags:</span><span class="value">${tags}</span></div>
    <div class="info-row"><span class="preceding-info">Créé en:</span><span class="value">${creationDate}</span></div>
</div>

    `
    let id = new URLSearchParams(window.location.search).get('id');
    let movieUrl = `/data/movie/${id}.mp4`
    document.getElementById("videoDisplay").innerHTML += `
      <video id="video" controls>
        <source src=${movieUrl} type="video/mp4">
      </video>`
}


fetchApi().then(data => domInserter(data));