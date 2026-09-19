(function () {
  if (window.__nfdsPageHookInstalled) return;
  window.__nfdsPageHookInstalled = true;

  const MAX_NODES = 6000;
  const MAX_FOUND = 12;
  const MAX_SCANS = 60;
  const MAX_RECENT_MANIFESTS = 24;
  const RECENT_MANIFEST_TTL = 5 * 60 * 1000;
  const ROUTE_FALLBACK_WINDOW = 5000;
  const SUSPECT_URL = /manifest|metadata|timedtext|subtitle|cadmium|shakti|pathEvaluator|website|memberapi/i;
  const queue = [];
  const recentManifests = [];
  let scanScheduled = false;
  let scansRun = 0;
  let lastPublishAt = 0;
  let lastUrl = location.href;
  let replayHandle = 0;

  function mayContainTimedText(text) {
    return typeof text !== "string" || /timedtext|timedText|textTracks|subtitleTracks|ttDownloadables|downloadables/i.test(text);
  }

  function looksLikeTimedText(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value.timedtexttracks) || Array.isArray(value.timedTextTracks)) return true;
    if (Array.isArray(value.textTracks) || Array.isArray(value.subtitleTracks)) return true;
    if (value.ttDownloadables || value.downloadables || value.downloadUrls || value.urls) {
      return Boolean(value.language || value.languageDescription || value.bcp47 || value.trackType);
    }
    return false;
  }

  function scanForTimedText(root) {
    const found = [];
    const stack = [root];
    const seen = new WeakSet();
    let visited = 0;

    while (stack.length && visited < MAX_NODES && found.length < MAX_FOUND) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      visited += 1;

      if (looksLikeTimedText(node)) found.push(node);

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) stack.push(node[i]);
      } else {
        for (const key of Object.keys(node)) {
          const child = node[key];
          if (child && typeof child === "object") stack.push(child);
        }
      }
    }

    return found;
  }

  function compactTrack(track) {
    if (!track || typeof track !== "object") return null;
    return {
      language: track.language,
      bcp47: track.bcp47,
      languageCode: track.languageCode,
      locale: track.locale,
      newTrackId: track.newTrackId,
      languageDescription: track.languageDescription,
      displayName: track.displayName,
      label: track.label,
      name: track.name,
      trackType: track.trackType,
      rawTrackType: track.rawTrackType,
      type: track.type,
      isNoneTrack: track.isNoneTrack,
      ttDownloadables: track.ttDownloadables,
      downloadables: track.downloadables,
      downloadable: track.downloadable,
      downloadUrls: track.downloadUrls,
      urls: track.urls
    };
  }

  function candidateContentIds(candidate) {
    const ids = new Set();
    const containers = [
      candidate,
      candidate.summary,
      candidate.video,
      candidate.playable,
      candidate.viewable
    ].filter((value) => value && typeof value === "object");
    const keys = [
      "id",
      "movieId",
      "videoId",
      "viewableId",
      "playableId",
      "titleId",
      "episodeId"
    ];

    containers.forEach((container) => {
      keys.forEach((key) => {
        const value = container[key];
        if (typeof value === "string" || typeof value === "number") {
          const normalized = String(value).trim();
          if (normalized) ids.add(normalized);
        }
      });
    });

    return Array.from(ids);
  }

  function compactCandidate(candidate) {
    const arrays = [
      candidate.timedtexttracks,
      candidate.timedTextTracks,
      candidate.textTracks,
      candidate.subtitleTracks
    ].filter(Array.isArray);

    if (arrays.length) {
      return {
        timedtexttracks: arrays.flat().map(compactTrack).filter(Boolean),
        contentIds: candidateContentIds(candidate)
      };
    }

    const track = compactTrack(candidate);
    return track
      ? { timedtexttracks: [track], contentIds: candidateContentIds(candidate) }
      : null;
  }

  function rememberManifest(candidates) {
    const now = Date.now();
    recentManifests.push({
      at: now,
      href: location.href,
      ids: Array.from(new Set(candidates.flatMap((candidate) => candidate.contentIds || []))),
      candidates
    });
    while (
      recentManifests.length > MAX_RECENT_MANIFESTS ||
      (recentManifests[0] && now - recentManifests[0].at > RECENT_MANIFEST_TTL)
    ) {
      recentManifests.shift();
    }
  }

  function postManifestCandidates(candidates, replayed = false) {
    window.postMessage(
      {
        source: "netflix-dual-official-subs",
        type: "NFDS_MANIFEST_CANDIDATES",
        candidates,
        replayed
      },
      window.location.origin
    );
  }

  function currentWatchId() {
    const match = location.pathname.match(/\/watch\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function replayRecentManifest() {
    const now = Date.now();
    while (recentManifests[0] && now - recentManifests[0].at > RECENT_MANIFEST_TTL) {
      recentManifests.shift();
    }
    if (!recentManifests.length) return;

    const watchId = currentWatchId();
    const currentPage = location.href.split(/[?#]/)[0];
    const matching = [...recentManifests].reverse().find(
      (snapshot) =>
        (watchId && snapshot.ids.includes(watchId)) ||
        snapshot.href.split(/[?#]/)[0] === currentPage
    );
    const fallback = [...recentManifests]
      .reverse()
      .find((snapshot) => now - snapshot.at <= ROUTE_FALLBACK_WINDOW);
    const snapshot = matching || fallback;
    if (snapshot) postManifestCandidates(snapshot.candidates, true);
  }

  function scheduleRecentReplay() {
    window.clearTimeout(replayHandle);
    replayHandle = window.setTimeout(() => {
      replayHandle = 0;
      replayRecentManifest();
    }, 100);
  }

  function publishManifestCandidates(value) {
    try {
      const now = Date.now();
      if (now - lastPublishAt < 500) return;
      const candidates = scanForTimedText(value);
      if (!candidates.length) return;
      const compact = candidates.map(compactCandidate).filter(Boolean);
      if (!compact.length) return;
      lastPublishAt = now;
      rememberManifest(compact);
      postManifestCandidates(compact);
    } catch (_) {
      // Keep Netflix playback untouched if the scanner sees an unexpected shape.
    }
  }

  function resetScanner() {
    // A next-episode manifest can be parsed just before Netflix updates the URL. Keep
    // recently queued work across the reset so that route handling cannot discard it.
    const now = Date.now();
    const currentUrl = location.href;
    const recent = queue.filter(
      (item) => item.url === currentUrl || now - item.queuedAt < 2500
    );
    queue.length = 0;
    queue.push(...recent.slice(-8));
    scansRun = 0;
    lastPublishAt = 0;
    if (queue.length) scheduleQueueRun();
  }

  function scheduleQueueRun() {
    if (scanScheduled) return;
    scanScheduled = true;

    const run = () => {
      scanScheduled = false;
      const next = queue.shift();
      if (!next || scansRun >= MAX_SCANS) return;

      const delay = 500 - (Date.now() - lastPublishAt);
      if (delay > 0) {
        queue.unshift(next);
        window.setTimeout(scheduleQueueRun, delay);
        return;
      }

      scansRun += 1;
      publishManifestCandidates(next.value);
      if (queue.length) scheduleQueueRun();
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 250);
    }
  }

  function scheduleScan(value) {
    if (!value || scansRun >= MAX_SCANS) return;
    queue.push({ value, url: location.href, queuedAt: Date.now() });
    if (queue.length > 8) queue.shift();
    scheduleQueueRun();
  }

  function scanTextIfUseful(text) {
    if (!mayContainTimedText(text)) return;
    try {
      scheduleScan(originalParse.call(JSON, text));
    } catch (_) {
      // Some Netflix responses are not JSON; the normal parser hook will catch JSON payloads.
    }
  }

  function handleRouteChange() {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    resetScanner();
    window.postMessage(
      {
        source: "netflix-dual-official-subs",
        type: "NFDS_ROUTE_CHANGED",
        href: lastUrl
      },
      window.location.origin
    );
    scheduleRecentReplay();
  }

  const originalParse = JSON.parse;
  JSON.parse = function patchedJsonParse(text, reviver) {
    const value = originalParse.call(this, text, reviver);
    if (mayContainTimedText(text)) scheduleScan(value);
    return value;
  };

  if (window.Response && window.Response.prototype && window.Response.prototype.json) {
    const originalJson = window.Response.prototype.json;
    window.Response.prototype.json = function patchedResponseJson() {
      const url = this && this.url ? String(this.url) : "";
      return originalJson.call(this).then((value) => {
        if (SUSPECT_URL.test(url)) scheduleScan(value);
        return value;
      });
    };
  }

  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const requestUrl =
        typeof input === "string"
          ? input
          : input && input.url
            ? String(input.url)
            : "";
      return originalFetch.call(this, input, init).then((response) => {
        if (SUSPECT_URL.test(requestUrl || response.url || "")) {
          try {
            response
              .clone()
              .text()
              .then((text) => {
                if (text.length < 8_000_000) scanTextIfUseful(text);
              })
              .catch(() => {});
          } catch (_) {
            // Cloning can fail for opaque/streamed responses; leave playback untouched.
          }
        }
        return response;
      });
    };
  }

  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    const requestUrls = new WeakMap();
    const observedRequests = new WeakSet();
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function patchedXhrOpen(method, url) {
      requestUrls.set(this, url == null ? "" : String(url));
      return originalOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function patchedXhrSend() {
      if (!observedRequests.has(this)) {
        observedRequests.add(this);
        this.addEventListener("load", () => {
          const url = requestUrls.get(this) || this.responseURL || "";
          if (!SUSPECT_URL.test(url)) return;
          try {
            if (this.responseType === "json" && this.response) {
              scheduleScan(this.response);
            } else if (!this.responseType || this.responseType === "text") {
              const text = this.responseText;
              if (text && text.length < 8_000_000) scanTextIfUseful(text);
            }
          } catch (_) {
            // Some response types disallow responseText access; leave the request alone.
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function patchedHistoryMethod() {
      const result = original.apply(this, arguments);
      window.setTimeout(handleRouteChange, 0);
      return result;
    };
  });

  window.addEventListener("popstate", () => window.setTimeout(handleRouteChange, 0));
  window.setInterval(handleRouteChange, 500);
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "netflix-dual-official-subs") return;
    if (event.data.type === "NFDS_RESET_SCANNER") {
      resetScanner();
      if (event.data.replayRecent) scheduleRecentReplay();
    }
  });
})();
