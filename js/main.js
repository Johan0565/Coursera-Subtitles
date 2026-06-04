"use strict";
// ── Types ──────────────────────────────────────────────────────────────────
// ── Constants ──────────────────────────────────────────────────────────────
const CHUNK_SIZE = 4500;
const LANG_NAMES = {
    fa: "Persian", ar: "Arabic", bg: "Bulgarian", ca: "Catalan",
    "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
    cs: "Czech", da: "Danish", nl: "Dutch", en: "English",
    fi: "Finnish", fr: "French", de: "German", el: "Greek",
    hi: "Hindi", hu: "Hungarian", id: "Indonesian", it: "Italian",
    ja: "Japanese", ko: "Korean", no: "Norwegian", pl: "Polish",
    pt: "Portuguese", ro: "Romanian", ru: "Russian", es: "Spanish",
    sv: "Swedish", th: "Thai", tr: "Turkish", uk: "Ukrainian",
    vi: "Vietnamese",
};
// ── Module state ───────────────────────────────────────────────────────────
let originalCues = null;
let isTranslating = false;
let autoTranslate = false;
let navigationTimeout = null;
let lastUrl = location.href;
// ── SPA navigation detection ───────────────────────────────────────────────
function handleNavigation() {
    originalCues = null;
    isTranslating = false;
    if (navigationTimeout !== null) {
        clearTimeout(navigationTimeout);
        navigationTimeout = null;
    }
    chrome.runtime.sendMessage({ method: "badge", text: "" });
    if (!autoTranslate)
        return;
    navigationTimeout = setTimeout(() => {
        navigationTimeout = null;
        chrome.storage.sync.get(["lang", "bilingual"], (result) => {
            if (result["lang"]) {
                openBilingual(result["bilingual"] || false);
            }
        });
    }, 3000);
}
const nav = window.navigation;
if (nav) {
    nav.addEventListener("navigate", (e) => {
        if (e.destination.url !== lastUrl) {
            lastUrl = e.destination.url;
            handleNavigation();
        }
    });
}
else {
    const wrap = (original) => (...args) => {
        original(...args);
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    };
    history.pushState = wrap(history.pushState.bind(history));
    history.replaceState = wrap(history.replaceState.bind(history));
    window.addEventListener("popstate", () => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            handleNavigation();
        }
    });
}
// ── Helpers ────────────────────────────────────────────────────────────────
function waitForCues(track) {
    return new Promise((resolve) => {
        if (track.cues && track.cues.length > 0) {
            resolve();
            return;
        }
        const deadline = Date.now() + 8000;
        const id = setInterval(() => {
            if ((track.cues && track.cues.length > 0) || Date.now() >= deadline) {
                clearInterval(id);
                resolve();
            }
        }, 100);
    });
}
async function fetchTranslation(text, lang) {
    const url = `https://translate.googleapis.com/translate_a/single` +
        `?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return json[0].map((item) => item[0]).join("");
}
async function fetchWithRetry(text, lang, maxRetries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchTranslation(text, lang);
        }
        catch (err) {
            lastErr = err;
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
            }
        }
    }
    throw lastErr;
}
function showToast(lang) {
    const existing = document.getElementById("cse-toast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.id = "cse-toast";
    Object.assign(toast.style, {
        position: "fixed",
        bottom: "90px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.76)",
        backdropFilter: "blur(12px)",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: "20px",
        fontSize: "14px",
        fontFamily: "-apple-system, system-ui, sans-serif",
        zIndex: "2147483647",
        pointerEvents: "none",
        opacity: "1",
        transition: "opacity 0.4s ease",
        whiteSpace: "nowrap",
    });
    toast.textContent = `Subtitles translated to ${LANG_NAMES[lang] ?? lang} ✓`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
// ── Core translation ────────────────────────────────────────────────────────
async function openBilingual(bilingual) {
    if (isTranslating)
        return "busy";
    isTranslating = true;
    try {
        const video = document.querySelector("video");
        if (!video) {
            alert("Video not found!");
            return "error";
        }
        const enTrack = Array.from(video.textTracks).find((t) => t.language === "en" || t.label.toLowerCase().includes("english"));
        if (!enTrack) {
            alert("English subtitle track not found. Please enable English subs first.");
            return "error";
        }
        enTrack.mode = "showing";
        await waitForCues(enTrack);
        const cues = enTrack.cues;
        if (!cues || cues.length === 0) {
            alert("Cues empty. Try playing the video for a moment first.");
            return "error";
        }
        if (!originalCues) {
            originalCues = Array.from(cues).map((c) => c.text);
        }
        const segments = originalCues.map((text, i) => text.replace(/\n/g, " ") + ` [${i}] `);
        const chunks = [];
        let current = "";
        for (const seg of segments) {
            if (current.length > 0 && current.length + seg.length > CHUNK_SIZE) {
                chunks.push(current);
                current = "";
            }
            current += seg;
        }
        if (current)
            chunks.push(current);
        return await new Promise((resolve) => {
            chrome.storage.sync.get(["lang"], async (result) => {
                const targetLang = result["lang"] || "fa";
                try {
                    const translatedChunks = [];
                    const progress = { done: 0, total: chunks.length };
                    chrome.storage.local.set({ translationProgress: progress });
                    for (let i = 0; i < chunks.length; i++) {
                        translatedChunks.push(await fetchWithRetry(chunks[i], targetLang));
                        chrome.storage.local.set({ translationProgress: { done: i + 1, total: chunks.length } });
                    }
                    const translatedText = translatedChunks.join("");
                    for (let i = 0; i < cues.length; i++) {
                        const startMarker = `[${i}]`;
                        const endMarker = `[${i + 1}]`;
                        const startIdx = translatedText.indexOf(startMarker);
                        const endIdx = translatedText.indexOf(endMarker);
                        if (startIdx !== -1) {
                            const raw = endIdx !== -1
                                ? translatedText.substring(startIdx + startMarker.length, endIdx)
                                : translatedText.substring(startIdx + startMarker.length);
                            const cue = cues[i];
                            cue.text = bilingual
                                ? raw.trim() + "\n" + originalCues[i]
                                : raw.trim();
                        }
                    }
                    chrome.storage.local.remove("translationProgress");
                    autoTranslate = true;
                    showToast(targetLang);
                    chrome.runtime.sendMessage({ method: "badge", text: "ON" });
                    resolve("done");
                }
                catch (err) {
                    console.error("Translation failed", err);
                    chrome.storage.local.remove("translationProgress");
                    resolve("error");
                }
            });
        });
    }
    finally {
        isTranslating = false;
    }
}
function resetSubtitles() {
    if (!originalCues)
        return;
    const video = document.querySelector("video");
    if (!video)
        return;
    const enTrack = Array.from(video.textTracks).find((t) => t.language === "en" || t.label.toLowerCase().includes("english"));
    if (!enTrack?.cues)
        return;
    for (let i = 0; i < enTrack.cues.length; i++) {
        if (originalCues[i] !== undefined) {
            enTrack.cues[i].text = originalCues[i];
        }
    }
    originalCues = null;
    autoTranslate = false;
    chrome.runtime.sendMessage({ method: "badge", text: "" });
}
// ── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const req = request;
    if (req.method === "translate") {
        openBilingual(req.bilingual).then((status) => sendResponse({ status }));
        return true; // keep the message channel open for the async response
    }
    if (req.method === "reset") {
        resetSubtitles();
        sendResponse({ status: "reset" });
        return true;
    }
});
