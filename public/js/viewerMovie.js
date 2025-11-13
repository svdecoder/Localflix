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
      <span id="title">Titre: ${title}</span><br>
      <span id="data">Auteurs: ${author}</span><br>
      <span id="description">Description: ${description}</span><br>
      <span id="data">Tags: ${tags}</span><br>
      <span id="data">Créé en: ${creationDate}</span>
    </div>
    `
    let id = new URLSearchParams(window.location.search).get('id');
    let movieUrl = `/data/movie/${id}.mp4`
    document.getElementById("videoDisplay").innerHTML += `
      <object 
        id="video"
        data="${movieUrl}" 
        type="video/mp4">
      </object>`
}


fetchApi().then(data => domInserter(data));