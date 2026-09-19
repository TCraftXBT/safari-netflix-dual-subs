const extensionApi = typeof browser !== "undefined" ? browser : chrome;

const elements = {
  status: document.querySelector("#status"),
  enabled: document.querySelector("#enabled"),
  secondaryLanguage: document.querySelector("#secondaryLanguage"),
  fontSize: document.querySelector("#fontSize"),
  bottom: document.querySelector("#bottom"),
  backgroundOpacity: document.querySelector("#backgroundOpacity"),
  reload: document.querySelector("#reload")
};

let activeTabId = null;
let lastStatus = null;
let discoveryTimer = 0;

function setStatus(text) {
  elements.status.textContent = text;
}

async function activeNetflixTab() {
  const tabs = await extensionApi.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !/^https:\/\/www\.netflix\.com\//.test(tab.url || "")) return null;
  return tab;
}

function sendToTab(message) {
  return extensionApi.tabs.sendMessage(activeTabId, message);
}

function optionLabel(track) {
  const parts = [];
  if (track.label) parts.push(track.label);
  if (track.language && track.language !== track.label) parts.push(track.language);
  if (track.trackType) parts.push(track.isAssistive ? "ASSISTIVE / SDH" : track.trackType);
  return parts.join(" · ");
}

function render(status) {
  lastStatus = status;
  elements.enabled.checked = Boolean(status.enabled);
  elements.fontSize.value = status.fontSize;
  elements.bottom.value = status.bottom;
  elements.backgroundOpacity.value = status.backgroundOpacity;

  elements.secondaryLanguage.textContent = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = status.tracks.length ? "Choose a Netflix subtitle track" : "No tracks detected yet";
  elements.secondaryLanguage.appendChild(blank);

  status.tracks.forEach((track) => {
    const option = document.createElement("option");
    option.value = track.key;
    option.textContent = optionLabel(track);
    elements.secondaryLanguage.appendChild(option);
  });

  elements.secondaryLanguage.value = status.secondaryLanguage || "";

  if (status.cueCount) {
    const track = status.lastLoadedTrack ? ` · ${status.lastLoadedTrack}` : "";
    const host = status.lastLoadedHost ? ` · ${status.lastLoadedHost}` : "";
    const warning = status.lastError ? ` · retry warning: ${status.lastError}` : "";
    setStatus(`${status.cueCount} cues loaded${track}${host}${warning}`);
  } else if (status.lastError) {
    setStatus(status.lastError);
  } else if (status.tracks.length) {
    setStatus(`${status.tracks.length} Netflix subtitle tracks detected.`);
  } else {
    setStatus("Waiting for Netflix subtitle tracks…");
  }

  if (status.tracks.length && discoveryTimer) {
    window.clearInterval(discoveryTimer);
    discoveryTimer = 0;
  }
}

async function refresh() {
  const tab = await activeNetflixTab();
  if (!tab) {
    setStatus("Open a Netflix video first.");
    return;
  }
  activeTabId = tab.id;
  try {
    render(await sendToTab({ type: "NFDS_GET_STATUS" }));
  } catch (_) {
    setStatus("Refresh the Netflix tab, then try again.");
  }
}

async function applySettings() {
  if (!activeTabId || !lastStatus) return;
  const settings = {
    enabled: elements.enabled.checked,
    secondaryLanguage: elements.secondaryLanguage.value,
    fontSize: Number(elements.fontSize.value),
    bottom: Number(elements.bottom.value),
    backgroundOpacity: Number(elements.backgroundOpacity.value)
  };
  render(await sendToTab({ type: "NFDS_APPLY_SETTINGS", settings }));
}

["change", "input"].forEach((eventName) => {
  elements.enabled.addEventListener(eventName, applySettings);
  elements.secondaryLanguage.addEventListener(eventName, applySettings);
  elements.fontSize.addEventListener(eventName, applySettings);
  elements.bottom.addEventListener(eventName, applySettings);
  elements.backgroundOpacity.addEventListener(eventName, applySettings);
});

elements.reload.addEventListener("click", async () => {
  if (!activeTabId) return;
  render(await sendToTab({ type: "NFDS_RELOAD_TRACK" }));
});

refresh();
discoveryTimer = window.setInterval(() => {
  if (!lastStatus || !lastStatus.tracks.length) refresh();
}, 750);
