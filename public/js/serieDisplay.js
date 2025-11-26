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
      <a href="/viewerS?id=${identifier}" class="video-link">
      <div class="elementVideo">
        <img src="${thumbnail}" onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';" class="videoButtonImage">
      <span class="title">${title}</span>
      <span class="description">${description}</span>
      <span class="information">Episode number ${episode} from season ${seasonNumber}</span>
    </div>
  </a>`
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

handler()