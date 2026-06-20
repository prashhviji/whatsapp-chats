/**
 * Background service worker. Its only job: make clicking the toolbar icon open
 * the side panel next to WhatsApp Web.
 */

function enableSidePanelOnActionClick() {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch((err) => console.error("setPanelBehavior failed:", err));
}

chrome.runtime.onInstalled.addListener(enableSidePanelOnActionClick);
// Also run when the worker spins up, in case onInstalled already fired.
enableSidePanelOnActionClick();
