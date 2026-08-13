async function fetchApi() {
  try {
    const response = await fetch("/api/newVideo");
    if (!response.ok) {
      throw new Error(`The fetch went wrong: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (err) {
    console.error(`Something went wrong: ${err}`);
  }
}

async function dataParser () {
  let dataArray = await fetchApi();
    serieData = []
    videoData = []
    for (let i=0; i < dataArray[0].length; i++) {
      data = [];
      let dataObject = dataArray[0][i];
      const tid = dataObject.id.replace(/\s+/g, "");
      data.push(`/data/thumbnail/${tid}.jpg`);
      data.push(dataObject.tags);
      data.push(dataObject.title);
      data.push(dataObject.id);
      serieData.push(data);
    }
    for (let i=0; i < dataArray[1].length; i++) {
      data = [];
      let dataObject = dataArray[1][i];
      const tid = dataObject.id.replace(/\s+/g, "");
      data.push(`/data/thumbnail/${tid}.jpg`);
      data.push(dataObject.tags);
      data.push(dataObject.title);
      data.push(dataObject.id);
      videoData.push(data);
    }
    return [serieData, videoData];
};

function renderTags(tags) {
  if (!tags) return "";
  return `<span class="tag-list">` + String(tags)
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => `<span class="tag-bubble">${t}</span>`)
    .join("") + `</span>`;
}

function domInserter(dataArray, viewerType, divName) {
  for (let i = 0; i < dataArray.length; i++) {
    let thumbnail = dataArray[i][0];
    thumbnail = String(thumbnail).replace(/ /g, "");
    let tags = dataArray[i][1];
    let title = dataArray[i][2];
    let identifier = dataArray[i][3];
    document.getElementById(divName).innerHTML += `
    <a href="/${viewerType}?id=${identifier}">
    <button class="elementVideo">
      <img src=${thumbnail} onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';" class="videoButtonImage"><br>
      <span class="title">${title}</span><br>
      ${renderTags(tags)}
    </button>
    </a>`
  }
};

dataParser().then(data => {
  domInserter(data[0], 'serieDisplay', 'serie');  
  domInserter(data[1], 'viewerM', 'movie');
});