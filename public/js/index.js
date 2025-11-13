async function fetchApi() {
  try {
    const response = await fetch("/api/identifiers");
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
    videoData = []
    for (let i=0; i < dataArray.length; i++) {
      data = [];
      let dataObject = dataArray[i];
      data.push(`/data/thumbnail/${dataObject.identifier}.jpg`);
      data.push(dataObject.tags);
      data.push(dataObject.title);
      data.push(dataObject.identifier);
      videoData.push(data);
    }
    return videoData;
};

function domInserter(dataArray) {
  for (let i = 0; i < dataArray.length; i++) {
    let thumbnail = dataArray[i][0];
    let tags = dataArray[i][1];
    let title = dataArray[i][2];
    let identifier = dataArray[i][3];
    document.getElementById("latestVids").innerHTML += `
    <a href="/viewerM?id=${identifier}">
    <button class="elementVideo">
      <img src=${thumbnail} alt="Thumbnail didn't loaded" class="videoButtonImage"><br>
      <span class="title">${title}</span><br>
      <span class="tag">${tags}</span>
    </button>
    </a>`
  }
};

dataParser().then(videoData => domInserter(videoData));