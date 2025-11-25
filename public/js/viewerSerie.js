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
      <span id="title">Titre: ${title}</span><br>
      <span id="serie">Titre: ${serie}</span><br>
      <span id="data">Season: ${season}</span><br>
      <span id="data">Episode: ${episode}</span><br>
      <span id="description">Description: ${description}</span><br>
      <span id="data">Créé en: ${creationDate}</span>
    </div>
    `
    let id = new URLSearchParams(window.location.search).get('id');
    let movieUrl = `/data/serie/${serie}/${id}.mp4`
    console.log(movieUrl)
    document.getElementById("videoDisplay").innerHTML += `
      <object 
        id="video"
        data="${movieUrl}" 
        type="video/mp4">
      </object>`
}


fetchApi().then(data => domInserter(data));