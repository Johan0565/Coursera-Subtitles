document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("translateBtn");
  const resetBtn = document.getElementById("resetBtn");
  const btnText = btn.querySelector("span");
  const bilingualToggle = document.getElementById("bilingualToggle");

  // Restore saved language and bilingual preference
  chrome.storage.sync.get(["lang", "bilingual"], (result) => {
    if (result.lang) {
      document.getElementById("lang").value = result.lang;
      const match = document.querySelector(`.option[data-value="${result.lang}"]`);
      if (match) document.getElementById("selectedLabel").innerText = match.innerText;
    }
    if (result.bilingual) bilingualToggle.checked = result.bilingual;
  });

  bilingualToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ bilingual: bilingualToggle.checked });
  });

  btn.addEventListener("click", () => {
    const lang = document.getElementById("lang").value;
    const bilingual = bilingualToggle.checked;

    const originalText = btnText.innerText;
    btnText.innerText = "Translating...";
    btn.style.opacity = "0.7";
    btn.style.pointerEvents = "none";

    chrome.storage.sync.set({ lang, bilingual });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(
        tabs[0].id,
        { method: "translate", bilingual },
        (response) => {
          if (chrome.runtime.lastError || !response || response.status === "error") {
            btnText.innerText = "Failed — try again";
            btn.style.opacity = "1";
            btn.style.pointerEvents = "all";
            setTimeout(() => {
              btnText.innerText = originalText;
            }, 2500);
          } else {
            btnText.innerText = originalText;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "all";
          }
        },
      );
    });
  });

  resetBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { method: "reset" });
    });
  });
});
