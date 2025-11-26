async function fetchApi() {
  const id = new URLSearchParams(window.location.search).get('id')
  try {
    const response = await fetch(`/api/dataEpisode?id=${id}`);
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
    console.log(dataObject)
    let title = dataObject[0].title;
    let description = dataObject[0].description;
    let episode = dataObject[0].episode;
    let season = dataObject[0].season;
    let serie = dataObject[0].serie_id;
    let creationDate = dataObject[0].created_at;
    
    document.getElementById("videoInformation").innerHTML += `
<div class="videoInformations">
    <div class="info-row"><span class="preceding-info">Episode title:</span><span class="value">${title}</span></div>
    <div class="info-row"><span class="preceding-info">Serie:</span><span class="value">${serie}</span></div>
    <div class="info-row"><span class="preceding-info">Season:</span><span class="value">${season}</span></div>
    <div class="info-row"><span class="preceding-info">Episode:</span><span class="value">${episode}</span></div>
    <div class="info-row"><span class="preceding-info">Description:</span><span class="value">${description}</span></div>
    <div class="info-row"> <span class="preceding-info">Créé en:</span><span class="value">${creationDate}</span></div>
</div>

    `
    let id = new URLSearchParams(window.location.search).get('id');
    let movieUrl = `/data/serie/${serie}/${id}.mp4`
    console.log(movieUrl)
    document.getElementById("videoDisplay").innerHTML += `
      <video id="video" controls>
        <source src=${movieUrl} type="video/mp4">
      </video>`
}


fetchApi().then(data => domInserter(data));