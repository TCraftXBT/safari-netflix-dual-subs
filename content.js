(() => {
  if (window.__nfdsContentInstalled) return;
  window.__nfdsContentInstalled = true;

  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  const DEFAULT_SETTINGS = {
    enabled: true,
    secondaryLanguage: "",
    fontSize: 22,
    bottom: 13,
    backgroundOpacity: 72
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    tracks: [],
    cues: [],
    activeCue: null,
    lastManifestAt: 0,
    lastError: "",
    lastLoadedTrack: "",
    lastLoadedHost: "",
    lastLoadAttempt: "",
    pageKey: location.href,
    overlay: null,
    overlayContainer: null,
    video: null,
    lastOverlayText: "",
    tickHandle: 0,
    navigationHandle: 0,
    resizeHandle: 0,
    playbackGeneration: 0,
    loadSequence: 0
  };

  function injectPageHook() {
    const parent = document.documentElement || document.head || document.body;
    if (!parent) {
      document.addEventListener("DOMContentLoaded", injectPageHook, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = extensionApi.runtime.getURL("page-hook.js");
    script.async = false;
    script.onload = () => script.remove();
    parent.appendChild(script);
  }

  function notifyScannerReset(replayRecent = false) {
    window.postMessage(
      {
        source: "netflix-dual-official-subs",
        type: "NFDS_RESET_SCANNER",
        replayRecent,
        href: location.href
      },
      window.location.origin
    );
  }

  function uniqueKey(track) {
    return [track.language, track.trackType, track.label].filter(Boolean).join("|");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isOffLabel(value) {
    return /^(off|none|disabled|关闭|關閉|无|無|なし)$/i.test(cleanText(value));
  }

  function isHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  function collectUrlCandidates(value, source = "", candidates = []) {
    if (!value) return candidates;
    if (isHttpUrl(value)) {
      candidates.push({ url: value, source });
      return candidates;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectUrlCandidates(item, `${source}.${index}`, candidates));
      return candidates;
    }
    if (typeof value === "object") {
      Object.keys(value).forEach((key) => collectUrlCandidates(value[key], source ? `${source}.${key}` : key, candidates));
    }
    return candidates;
  }

  function scoreSubtitleUrl(candidate) {
    const haystack = `${candidate.source} ${candidate.url}`.toLowerCase();
    let score = 0;
    if (/webvtt|vtt/.test(haystack)) score += 80;
    if (/dfxp|ttml|xml|timedtext|text/.test(haystack)) score += 60;
    if (/simple|simplesdh|lssdh|webvtt-lssdh/.test(haystack)) score += 15;
    if (/image|itt-image|nflx-cmisc|png|jpg|jpeg/.test(haystack)) score -= 200;
    if (/\/\?/.test(candidate.url) || /\?/.test(candidate.url)) score += 2;
    return score;
  }

  function findDownloadCandidates(track) {
    const containers = [
      track.ttDownloadables,
      track.downloadables,
      track.downloadable,
      track.downloadUrls,
      track.urls
    ].filter(Boolean);

    const allCandidates = [];
    for (const container of containers) {
      if (typeof container !== "object") continue;
      allCandidates.push(...collectUrlCandidates(container));
    }

    if (!allCandidates.length) allCandidates.push(...collectUrlCandidates(track));

    const byUrl = new Map();
    allCandidates
      .filter((candidate) => scoreSubtitleUrl(candidate) > -100)
      .forEach((candidate) => {
        const score = scoreSubtitleUrl(candidate);
        const previous = byUrl.get(candidate.url);
        if (!previous || score > previous.score) byUrl.set(candidate.url, { url: candidate.url, source: candidate.source, score });
      });

    return Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
  }

  function normalizeTrack(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.isNoneTrack || raw.language === "none") return null;

    const language =
      raw.language ||
      raw.bcp47 ||
      raw.languageCode ||
      raw.locale ||
      raw.newTrackId ||
      "";
    const label = cleanText(
      raw.languageDescription ||
        raw.displayName ||
        raw.label ||
        raw.name ||
        language ||
        ""
    );
    const trackType = cleanText(raw.trackType || raw.rawTrackType || raw.type || "");

    if (!language || !label || isOffLabel(label) || /^unknown$/i.test(label)) return null;

    const downloads = findDownloadCandidates(raw);
    if (!downloads.length) return null;

    return {
      language: cleanText(language),
      label,
      trackType,
      url: downloads[0].url,
      urls: downloads.map((item) => item.url).slice(0, 6),
      score: downloads[0].score
    };
  }

  function extractTracksFromCandidate(candidate) {
    const arrays = [
      candidate.timedtexttracks,
      candidate.timedTextTracks,
      candidate.textTracks,
      candidate.subtitleTracks
    ].filter(Array.isArray);

    const rawTracks = arrays.length ? arrays.flat() : [candidate];
    return rawTracks.map(normalizeTrack).filter(Boolean);
  }

  function mergeTracks(newTracks) {
    const byKey = new Map(state.tracks.map((track) => [uniqueKey(track), track]));
    newTracks.forEach((track) => {
      const key = uniqueKey(track);
      const previous = byKey.get(key);
      if (!previous || (track.score || 0) > (previous.score || 0)) {
        byKey.set(key, {
          ...track,
          urls: mergeUrls(track.urls || [track.url], previous ? previous.urls || [previous.url] : [])
        });
      } else if (previous) {
        previous.urls = mergeUrls(previous.urls || [previous.url], track.urls || [track.url]);
      }
    });
    state.tracks = Array.from(byKey.values()).sort((a, b) => {
      const typeRank = (track) => (track.trackType === "PRIMARY" ? 0 : track.trackType === "ASSISTIVE" ? 1 : 2);
      const languageCompare = a.language.localeCompare(b.language);
      if (languageCompare) return languageCompare;
      const typeCompare = typeRank(a) - typeRank(b);
      if (typeCompare) return typeCompare;
      const aName = `${a.label} ${a.trackType}`;
      const bName = `${b.label} ${b.trackType}`;
      return aName.localeCompare(bName);
    });
  }

  function mergeUrls(first, second) {
    const seen = new Set();
    return [...first, ...second].filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function readNumericAttr(element, names, fallback) {
    for (const name of names) {
      const value = element.getAttribute(name);
      if (value && Number.isFinite(Number(value))) return Number(value);
    }
    return fallback;
  }

  function readTiming(doc) {
    const root = doc.documentElement;
    const tickRate =
      readNumericAttr(root, ["ttp:tickRate", "tickRate"], null) ||
      Number(root.getAttributeNS("http://www.w3.org/ns/ttml#parameter", "tickRate")) ||
      1;
    const frameRate =
      readNumericAttr(root, ["ttp:frameRate", "frameRate"], null) ||
      Number(root.getAttributeNS("http://www.w3.org/ns/ttml#parameter", "frameRate")) ||
      24;
    const multiplier =
      root.getAttribute("ttp:frameRateMultiplier") ||
      root.getAttribute("frameRateMultiplier") ||
      root.getAttributeNS("http://www.w3.org/ns/ttml#parameter", "frameRateMultiplier") ||
      "";
    const [numerator, denominator] = multiplier.split(/\s+/).map(Number);

    return {
      tickRate,
      frameRate: numerator && denominator ? frameRate * (numerator / denominator) : frameRate
    };
  }

  function parseTime(value, timing = {}) {
    if (!value) return 0;
    const text = String(value).trim();
    if (text.endsWith("ms")) return Number.parseFloat(text) / 1000;
    if (text.endsWith("s")) return Number.parseFloat(text);
    if (text.endsWith("m")) return Number.parseFloat(text) * 60;
    if (text.endsWith("h")) return Number.parseFloat(text) * 3600;
    if (text.endsWith("t")) return Number.parseFloat(text) / (timing.tickRate || 1);
    if (text.endsWith("f")) return Number.parseFloat(text) / (timing.frameRate || 24);

    const parts = text.split(":");
    if (parts.length === 4) {
      const [hours, minutes, seconds, frames] = parts.map(Number);
      return hours * 3600 + minutes * 60 + seconds + frames / (timing.frameRate || 24);
    }
    if (parts.length === 3) {
      return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number.parseFloat(parts[2]);
    }
    if (parts.length === 2) {
      return Number(parts[0]) * 60 + Number.parseFloat(parts[1]);
    }
    return Number.parseFloat(text) || 0;
  }

  function cueTextFromElement(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return clone.textContent
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function decodeEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  function stripTags(text) {
    return decodeEntities(
      text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " ")
    )
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function readLooseAttribute(text, name) {
    const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
    const match = text.match(pattern);
    return match ? decodeEntities(match[2]) : "";
  }

  function readLooseTiming(text) {
    const tickRate = Number(readLooseAttribute(text, "tickRate")) || 1;
    const frameRate = Number(readLooseAttribute(text, "frameRate")) || 24;
    const multiplier = readLooseAttribute(text, "frameRateMultiplier");
    const [numerator, denominator] = multiplier.split(/\s+/).map(Number);
    return {
      tickRate,
      frameRate: numerator && denominator ? frameRate * (numerator / denominator) : frameRate
    };
  }

  function parseLooseTimedText(text) {
    const timing = readLooseTiming(text);
    const cues = [];
    const pattern = /<(?:\w+:)?p\b[^>]*>[\s\S]*?<\/(?:\w+:)?p>/gi;
    let match;

    while ((match = pattern.exec(text))) {
      const block = match[0];
      const begin = parseTime(readLooseAttribute(block, "begin"), timing);
      const endAttr = readLooseAttribute(block, "end");
      const durAttr = readLooseAttribute(block, "dur");
      const end = endAttr ? parseTime(endAttr, timing) : begin + parseTime(durAttr, timing);
      const body = block.replace(/^<(?:\w+:)?p\b[^>]*>/i, "").replace(/<\/(?:\w+:)?p>$/i, "");
      const cue = {
        start: begin,
        end,
        text: stripTags(body)
      };
      if (cue.text && Number.isFinite(cue.start) && cue.end > cue.start) cues.push(cue);
    }

    return cues.sort((a, b) => a.start - b.start);
  }

  function parseXmlTimedText(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      const looseCues = parseLooseTimedText(text);
      if (looseCues.length) return looseCues;
      throw new Error("Subtitle XML parse failed.");
    }

    const timing = readTiming(doc);
    const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"));
    return paragraphs
      .map((p) => {
        const begin = parseTime(p.getAttribute("begin"), timing);
        const endAttr = p.getAttribute("end");
        const durAttr = p.getAttribute("dur");
        const end = endAttr ? parseTime(endAttr, timing) : begin + parseTime(durAttr, timing);
        return {
          start: begin,
          end,
          text: cueTextFromElement(p)
        };
      })
      .filter((cue) => cue.text && Number.isFinite(cue.start) && cue.end > cue.start)
      .sort((a, b) => a.start - b.start);
  }

  function parseWebVtt(text) {
    const blocks = text.replace(/\r/g, "").split(/\n\n+/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex === -1) continue;
      const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const body = lines.slice(timeLineIndex + 1).join("\n").replace(/<[^>]+>/g, "").trim();
      const start = parseTime(startRaw);
      const end = parseTime(endRaw);
      if (body && end > start) cues.push({ start, end, text: body });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseSubtitleText(text, contentType = "") {
    if (/webvtt|vtt/i.test(contentType) || /^\s*WEBVTT/i.test(text)) return parseWebVtt(text);
    return parseXmlTimedText(text);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function playerContainer() {
    const video = getVideo();
    return (
      fullscreenElement() ||
      document.querySelector(".watch-video") ||
      document.querySelector(".nf-player-container") ||
      document.querySelector("[data-uia='player']") ||
      document.querySelector(".VideoContainer") ||
      (video && video.parentElement) ||
      document.documentElement
    );
  }

  function overlayParent() {
    const container = playerContainer();
    if (!container || container.tagName === "VIDEO") return document.documentElement;
    return container;
  }

  function moveOverlayIntoPlayer() {
    if (!state.overlay) return;
    const parent = overlayParent();
    if (state.overlay.parentElement !== parent) {
      parent.appendChild(state.overlay);
      state.overlayContainer = parent;
    }
  }

  function ensureOverlay() {
    if (state.overlay && document.contains(state.overlay)) return state.overlay;

    const overlay = document.createElement("div");
    overlay.id = "nfds-overlay";
    overlay.setAttribute("aria-live", "off");
    overlay.hidden = true;
    state.overlay = overlay;
    document.documentElement.appendChild(overlay);
    state.overlayContainer = document.documentElement;
    return overlay;
  }

  function relocateOverlay() {
    ensureOverlay();
    moveOverlayIntoPlayer();
  }

  function applyOverlayStyle() {
    const overlay = ensureOverlay();
    overlay.style.setProperty("--nfds-font-size", `${state.settings.fontSize}px`);
    overlay.style.setProperty("--nfds-bottom", `${state.settings.bottom}%`);
    overlay.style.setProperty("--nfds-bg", `${Math.max(0, Math.min(100, state.settings.backgroundOpacity)) / 100}`);
  }

  function getVideo() {
    if (state.video && document.contains(state.video)) return state.video;
    state.video = document.querySelector("video");
    return state.video;
  }

  function renderCue() {
    const overlay = ensureOverlay();
    const video = getVideo();

    if (!state.settings.enabled || !video || !state.cues.length) {
      overlay.hidden = true;
      if (state.lastOverlayText) {
        overlay.textContent = "";
        state.lastOverlayText = "";
      }
      return;
    }

    const now = video.currentTime;
    const cue =
      state.activeCue && now >= state.activeCue.start && now <= state.activeCue.end
        ? state.activeCue
        : findCueAtTime(now);

    state.activeCue = cue || null;
    if (!cue) {
      overlay.hidden = true;
      if (state.lastOverlayText) {
        overlay.textContent = "";
        state.lastOverlayText = "";
      }
      return;
    }

    overlay.hidden = false;
    if (state.lastOverlayText !== cue.text) {
      overlay.textContent = cue.text;
      state.lastOverlayText = cue.text;
    }
  }

  function findCueAtTime(time) {
    let low = 0;
    let high = state.cues.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cue = state.cues[mid];
      if (time < cue.start) {
        high = mid - 1;
      } else if (time > cue.end) {
        low = mid + 1;
      } else {
        return cue;
      }
    }
    return null;
  }

  function startTicker() {
    if (state.tickHandle) return;
    state.tickHandle = window.setInterval(renderCue, 200);
    renderCue();
  }

  function selectedTrack() {
    const wanted = state.settings.secondaryLanguage;
    if (!wanted) return null;
    const wantedLanguage = String(wanted).split("|")[0];
    return (
      state.tracks.find((track) => uniqueKey(track) === wanted) ||
      state.tracks.find((track) => track.language === wantedLanguage) ||
      null
    );
  }

  function resetPlaybackState(reason) {
    state.playbackGeneration += 1;
    state.loadSequence += 1;
    state.tracks = [];
    state.cues = [];
    state.activeCue = null;
    state.lastManifestAt = 0;
    state.lastError = reason || "";
    state.lastLoadedTrack = "";
    state.lastLoadedHost = "";
    state.lastLoadAttempt = "";
    state.video = null;
    state.lastOverlayText = "";
    notifyScannerReset(Boolean(reason));
    renderCue();
  }

  function checkPageTransition() {
    if (state.pageKey === location.href) return false;
    state.pageKey = location.href;
    resetPlaybackState("Episode changed; waiting for Netflix subtitle tracks.");
    relocateOverlay();
    return true;
  }

  function startNavigationWatcher() {
    if (state.navigationHandle) return;
    state.navigationHandle = window.setInterval(() => {
      checkPageTransition();
    }, 1000);
  }

  async function loadSelectedTrack() {
    const track = selectedTrack();
    if (!track) {
      if (!state.settings.secondaryLanguage) {
        state.cues = [];
        state.activeCue = null;
        state.lastLoadedTrack = "";
        state.lastLoadedHost = "";
        renderCue();
      }
      return;
    }

    const playbackGeneration = state.playbackGeneration;
    const loadSequence = ++state.loadSequence;
    const isCurrentLoad = () =>
      playbackGeneration === state.playbackGeneration && loadSequence === state.loadSequence;
    const urls = track.urls && track.urls.length ? track.urls : [track.url];
    const errors = [];
    let best = null;

    for (const url of urls) {
      try {
        state.lastError = "";
        state.lastLoadAttempt = new URL(url).host;
        const response = await fetch(url, { credentials: "omit" });
        if (!isCurrentLoad()) return;
        if (!response.ok) throw new Error(`Subtitle request failed: ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        if (!isCurrentLoad()) return;
        const cues = parseSubtitleText(text, contentType);
        if (!cues.length) throw new Error("No text cues found. This track may be image-based.");
        const result = {
          cues,
          url,
          host: new URL(url).host
        };
        if (!best || result.cues.length > best.cues.length) best = result;
        if (result.cues.length >= 100) break;
      } catch (error) {
        errors.push(error && error.message ? error.message : String(error));
      }
    }

    if (!isCurrentLoad()) return;
    if (best) {
      state.cues = best.cues;
      state.activeCue = null;
      state.lastLoadedTrack = `${track.label} ${track.language} ${track.trackType}`.trim();
      state.lastLoadedHost = best.host;
      state.lastError = best.cues.length < 80 ? "Loaded a short subtitle track; refresh if it looks incomplete." : "";
      applyOverlayStyle();
      startTicker();
      return;
    }

    state.lastError = errors[0] || "Subtitle load failed.";
    if (!state.cues.length) {
      state.activeCue = null;
      renderCue();
    }
  }

  async function loadSettings() {
    const stored = await extensionApi.storage.local.get(DEFAULT_SETTINGS);
    state.settings = { ...DEFAULT_SETTINGS, ...stored };
    applyOverlayStyle();
  }

  async function saveSettings(settings) {
    state.settings = { ...state.settings, ...settings };
    await extensionApi.storage.local.set(state.settings);
    applyOverlayStyle();
    await loadSelectedTrack();
  }

  function status() {
    return {
      enabled: state.settings.enabled,
      secondaryLanguage: state.settings.secondaryLanguage,
      fontSize: state.settings.fontSize,
      bottom: state.settings.bottom,
      backgroundOpacity: state.settings.backgroundOpacity,
      tracks: state.tracks.map((track) => ({
        key: uniqueKey(track),
        language: track.language,
        label: track.label,
        trackType: track.trackType,
        isAssistive: track.trackType === "ASSISTIVE"
      })),
      cueCount: state.cues.length,
      lastLoadedTrack: state.lastLoadedTrack,
      lastLoadedHost: state.lastLoadedHost,
      lastManifestAt: state.lastManifestAt,
      lastError: state.lastError
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "netflix-dual-official-subs") return;

    if (event.data.type === "NFDS_ROUTE_CHANGED") {
      checkPageTransition();
      return;
    }

    if (event.data.type !== "NFDS_MANIFEST_CANDIDATES") return;

    checkPageTransition();
    const candidates = Array.isArray(event.data.candidates) ? event.data.candidates : [];
    const tracks = candidates.flatMap(extractTracksFromCandidate);
    if (!tracks.length) return;

    mergeTracks(tracks);
    state.lastManifestAt = Date.now();
    if (/waiting for Netflix subtitle tracks/i.test(state.lastError)) state.lastError = "";
    if (selectedTrack() && !state.cues.length) await loadSelectedTrack();
  });

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "NFDS_GET_STATUS") {
      sendResponse(status());
      return false;
    }

    if (message.type === "NFDS_APPLY_SETTINGS") {
      saveSettings(message.settings || {}).then(() => sendResponse(status()));
      return true;
    }

    if (message.type === "NFDS_RELOAD_TRACK") {
      notifyScannerReset();
      loadSelectedTrack().then(() => sendResponse(status()));
      return true;
    }

    return false;
  });

  document.addEventListener("fullscreenchange", () => {
    relocateOverlay();
    renderCue();
  });
  document.addEventListener("webkitfullscreenchange", () => {
    relocateOverlay();
    renderCue();
  });
  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeHandle);
    state.resizeHandle = window.setTimeout(() => {
      relocateOverlay();
      renderCue();
    }, 150);
  });

  // Install the page-world network hooks before awaiting extension storage. Netflix can
  // parse its first playback manifest very early during a fresh navigation.
  injectPageHook();
  loadSettings().then(() => {
    relocateOverlay();
    startNavigationWatcher();
    startTicker();
  });
})();
