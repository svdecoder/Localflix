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

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  const tagArray = String(tags)
    .split(",")
    .map(t => t.trim())
    .filter(t => t.length > 0);
  if (tagArray.length === 0) return "";
  return `<span class="tag-list">` + tagArray
    .map(t => `<span class="tag-bubble">${escapeHtml(t)}</span>`)
    .join("") + `</span>`;
}

// After rendering, check if tag lists overflow and add a "+N more" indicator
function addTagOverflowIndicators() {
  document.querySelectorAll('#serie .tag-list, #movie .tag-list').forEach(tagList => {
    const allBubbles = Array.from(tagList.querySelectorAll('.tag-bubble'));
    if (allBubbles.length === 0) return;
    
    // Check if content overflows the 3-line clamp
    if (tagList.scrollHeight > tagList.clientHeight) {
      // Count how many bubbles are fully visible
      const listRect = tagList.getBoundingClientRect();
      let visibleCount = 0;
      for (const bubble of allBubbles) {
        const bubbleRect = bubble.getBoundingClientRect();
        if (bubbleRect.bottom <= listRect.bottom + 1) {
          visibleCount++;
        } else {
          break;
        }
      }
      const hiddenCount = allBubbles.length - visibleCount;
      if (hiddenCount > 0) {
        // Remove hidden bubbles
        for (let i = visibleCount; i < allBubbles.length; i++) {
          allBubbles[i].remove();
        }
        // Add "+N more" bubble at the end
        const moreBubble = document.createElement('span');
        moreBubble.className = 'tag-bubble tag-more';
        moreBubble.textContent = `+${hiddenCount} more`;
        tagList.appendChild(moreBubble);
        
        // If the "+N more" bubble is still clipped, remove more bubbles until it fits
        let safety = 0;
        while (tagList.scrollHeight > tagList.clientHeight && safety < 20) {
          const bubbles = tagList.querySelectorAll('.tag-bubble:not(.tag-more)');
          if (bubbles.length === 0) break;
          bubbles[bubbles.length - 1].remove();
          safety++;
        }
      }
    }
  });
}

function domInserter(dataArray, viewerType, divName) {
  let html = "";
  for (let i = 0; i < dataArray.length; i++) {
    let thumbnail = dataArray[i][0];
    thumbnail = String(thumbnail).replace(/ /g, "");
    let tags = dataArray[i][1];
    let title = dataArray[i][2];
    let identifier = dataArray[i][3];
    html += `
    <a href="/${viewerType}?id=${encodeURIComponent(identifier)}" class="video-link">
      <div class="elementVideo">
        <img src="${escapeAttr(thumbnail)}" onerror="this.onerror=null; this.src='api/images/default_thumbnail.jpg';" class="videoButtonImage">
        <span class="title">${escapeHtml(title)}</span>
        ${renderTags(tags)}
      </div>
    </a>`
  }
  document.getElementById(divName).innerHTML = html;
};

dataParser().then(data => {
  domInserter(data[0], 'serieDisplay', 'serie');  
  domInserter(data[1], 'viewerM', 'movie');
  addTagOverflowIndicators();
});
