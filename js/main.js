const CHUNK_SIZE = 4500;
let originalCues = null;

async function openBilingual(bilingual) {
  const video = document.querySelector("video");
  if (!video) {
    alert("Video not found!");
    return "error";
  }

  const tracks = video.textTracks;
  const enTrack = Array.from(tracks).find(
    (t) => t.language === "en" || t.label.toLowerCase().includes("english"),
  );

  if (!enTrack) {
    alert("English subtitle track not found. Please enable English subs first.");
    return "error";
  }

  enTrack.mode = "showing";

  if (!enTrack.cues || enTrack.cues.length === 0) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  const cues = enTrack.cues;
  if (!cues || cues.length === 0) {
    alert("Cues empty. Try playing the video for 1 second first.");
    return "error";
  }

  // Save originals on first translation so reset and re-translation always work from English
  if (!originalCues) {
    originalCues = Array.from(cues).map((c) => c.text);
  }

  const segments = originalCues.map(
    (text, i) => text.replace(/\n/g, " ") + ` [${i}] `,
  );

  // Split into chunks under CHUNK_SIZE to stay within the gtx API limit
  const chunks = [];
  let current = "";
  for (const seg of segments) {
    if (current.length > 0 && current.length + seg.length > CHUNK_SIZE) {
      chunks.push(current);
      current = "";
    }
    current += seg;
  }
  if (current) chunks.push(current);

  return new Promise((resolve) => {
    chrome.storage.sync.get(["lang"], async (result) => {
      const targetLang = result.lang || "fa";
      try {
        // Translate chunks sequentially to avoid rate limiting
        const translatedChunks = [];
        for (const chunk of chunks) {
          translatedChunks.push(await fetchTranslation(chunk, targetLang));
        }
        const translatedText = translatedChunks.join("");

        for (let i = 0; i < cues.length; i++) {
          const startMarker = `[${i}]`;
          const endMarker = `[${i + 1}]`;
          const startIdx = translatedText.indexOf(startMarker);
          const endIdx = translatedText.indexOf(endMarker);

          if (startIdx !== -1) {
            const raw =
              endIdx !== -1
                ? translatedText.substring(startIdx + startMarker.length, endIdx)
                : translatedText.substring(startIdx + startMarker.length);
            const translated = raw.trim();
            cues[i].text = bilingual
              ? translated + "\n" + originalCues[i]
              : translated;
          }
        }
        resolve("done");
      } catch (err) {
        console.error("Translation failed", err);
        resolve("error");
      }
    });
  });
}

function resetSubtitles() {
  if (!originalCues) return;

  const video = document.querySelector("video");
  if (!video) return;

  const tracks = video.textTracks;
  const enTrack = Array.from(tracks).find(
    (t) => t.language === "en" || t.label.toLowerCase().includes("english"),
  );

  if (!enTrack?.cues) return;

  for (let i = 0; i < enTrack.cues.length; i++) {
    if (originalCues[i] !== undefined) {
      enTrack.cues[i].text = originalCues[i];
    }
  }
  originalCues = null;
}

async function fetchTranslation(text, lang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  const json = await response.json();
  return json[0].map((item) => item[0]).join("");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.method === "translate") {
    openBilingual(request.bilingual).then((status) => sendResponse({ status }));
    return true;
  }
  if (request.method === "reset") {
    resetSubtitles();
    sendResponse({ status: "reset" });
    return true;
  }
});
