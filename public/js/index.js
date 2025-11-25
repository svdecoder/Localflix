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
      data.push(`/data/thumbnail/serie/${dataObject.id}.jpg`);
      data.push(dataObject.tags);
      data.push(dataObject.title);
      data.push(dataObject.id);
      serieData.push(data);
    }
    for (let i=0; i < dataArray[1].length; i++) {
      data = [];
      let dataObject = dataArray[1][i];
      data.push(`/data/thumbnail/${dataObject.id}.jpg`);
      data.push(dataObject.tags);
      data.push(dataObject.title);
      data.push(dataObject.id);
      videoData.push(data);
    }
    return [serieData, videoData];
};

function domInserter(dataArray, viewerType) {
  for (let i = 0; i < dataArray.length; i++) {
    let thumbnail = dataArray[i][0];
    let tags = dataArray[i][1];
    let title = dataArray[i][2];
    let identifier = dataArray[i][3];
    document.getElementById("latestVids").innerHTML += `
    <a href="/${viewerType}?id=${identifier}">
    <button class="elementVideo">
      <img src=${thumbnail} onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';" class="videoButtonImage"><br>
      <span class="title">${title}</span><br>
      <span class="tag">${tags}</span>
    </button>
    </a>`
  }
  document.getElementById("latestVids").innerHTML += `<br><br>`
};

dataParser().then(data => {
  domInserter(data[0], 'serieDisplay');  
  domInserter(data[1], 'viewerM');
});