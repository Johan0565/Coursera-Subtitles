"use strict";
// Single entry point for the extension popup.
// Combines dropdown (formerly drop.js) and popup control logic (formerly index.js).
document.addEventListener("DOMContentLoaded", () => {
    // ── Element refs ──────────────────────────────────────────────────────────
    const trigger = document.getElementById("selectTrigger");
    const container = document.getElementById("dropdownContainer");
    const hiddenInput = document.getElementById("lang");
    const selectedLabel = document.getElementById("selectedLabel");
    const langSearch = document.getElementById("langSearch");
    const options = document.querySelectorAll(".option");
    const btn = document.getElementById("translateBtn");
    const resetBtn = document.getElementById("resetBtn");
    const btnText = btn.querySelector("span");
    const bilingualToggle = document.getElementById("bilingualToggle");
    // ── Dropdown ──────────────────────────────────────────────────────────────
    function setActive(value) {
        options.forEach((o) => o.classList.remove("active"));
        const match = document.querySelector(`.option[data-value="${value}"]`);
        match?.classList.add("active");
    }
    function closeDropdown() {
        container.classList.remove("open");
        langSearch.value = "";
        options.forEach((o) => (o.style.display = ""));
    }
    setActive(hiddenInput.value);
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = container.classList.contains("open");
        container.classList.toggle("open");
        if (!wasOpen)
            requestAnimationFrame(() => langSearch.focus());
    });
    langSearch.addEventListener("click", (e) => e.stopPropagation());
    langSearch.addEventListener("input", () => {
        const q = langSearch.value.toLowerCase().trim();
        options.forEach((opt) => {
            opt.style.display = opt.innerText.toLowerCase().includes(q) ? "" : "none";
        });
    });
    options.forEach((opt) => {
        opt.addEventListener("click", () => {
            const value = opt.getAttribute("data-value") ?? "";
            selectedLabel.innerText = opt.innerText;
            hiddenInput.value = value;
            setActive(value);
            closeDropdown();
        });
    });
    document.addEventListener("click", () => closeDropdown());
    // ── Restore saved state ───────────────────────────────────────────────────
    chrome.storage.sync.get(["lang", "bilingual"], (result) => {
        const savedLang = result["lang"];
        if (savedLang) {
            hiddenInput.value = savedLang;
            const match = document.querySelector(`.option[data-value="${savedLang}"]`);
            if (match)
                selectedLabel.innerText = match.innerText;
            setActive(savedLang);
        }
        if (result["bilingual"]) {
            bilingualToggle.checked = result["bilingual"];
        }
    });
    bilingualToggle.addEventListener("change", () => {
        chrome.storage.sync.set({ bilingual: bilingualToggle.checked });
    });
    // ── Translate button ──────────────────────────────────────────────────────
    let progressInterval = null;
    btn.addEventListener("click", () => {
        const lang = hiddenInput.value;
        const bilingual = bilingualToggle.checked;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab?.id)
                return;
            const url = tab.url ?? "";
            if (!url.includes("coursera.org")) {
                const original = btnText.innerText;
                btnText.innerText = "Open a Coursera video first";
                btn.style.opacity = "1";
                btn.style.pointerEvents = "none";
                setTimeout(() => {
                    btnText.innerText = original;
                    btn.style.pointerEvents = "all";
                }, 2500);
                return;
            }
            const original = btnText.innerText;
            btnText.innerText = "Translating…";
            btn.style.opacity = "0.7";
            btn.style.pointerEvents = "none";
            chrome.storage.sync.set({ lang, bilingual });
            progressInterval = setInterval(() => {
                chrome.storage.local.get(["translationProgress"], (r) => {
                    const p = r["translationProgress"];
                    if (p && p.total > 1) {
                        btnText.innerText = `Translating… ${p.done} / ${p.total}`;
                    }
                });
            }, 400);
            chrome.tabs.sendMessage(tab.id, { method: "translate", bilingual }, (response) => {
                if (progressInterval !== null) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
                const status = response?.status;
                if (chrome.runtime.lastError || !response || status === "error") {
                    btnText.innerText = "Failed — try again";
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "all";
                    setTimeout(() => { btnText.innerText = original; }, 2500);
                }
                else if (status === "busy") {
                    btnText.innerText = "Already translating…";
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "all";
                    setTimeout(() => { btnText.innerText = original; }, 2000);
                }
                else {
                    btnText.innerText = original;
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "all";
                }
            });
        });
    });
    // ── Reset button ──────────────────────────────────────────────────────────
    resetBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id)
                chrome.tabs.sendMessage(tab.id, { method: "reset" });
        });
    });
});
