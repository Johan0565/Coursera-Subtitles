"use strict";
// Minimal service worker — manages the action badge on behalf of the content
// script, which cannot call chrome.action directly.
chrome.runtime.onMessage.addListener((request) => {
    const msg = request;
    if (msg.method === "badge") {
        chrome.action.setBadgeText({ text: msg.text });
        if (msg.text) {
            chrome.action.setBadgeBackgroundColor({ color: "#0a84ff" });
        }
    }
});
