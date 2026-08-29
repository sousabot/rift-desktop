let mediaStream = null;
let recorder = null;
let gameTime = 0;
let flushTimer = null;
let runId = 0;
let outName = null;
let writes = Promise.resolve();
let wantPause = false;
let armedPause = false;

window.recorderBridge.onStart((opts) => {
  start(opts).catch((err) => {
    window.recorderBridge.error(err.message || String(err));
  });
});
window.recorderBridge.onStop(() => {
  stop().catch(() => window.recorderBridge.stopped());
});
window.recorderBridge.onGameTime((t) => {
  gameTime = Number(t) || 0;
});
window.recorderBridge.onFocus(() => {
  // Ignore focus changes — keep MediaRecorder running through alt-tab.
});

function applyPause() {
  // Focus-based pause disabled.
}

function videoConstraints(sourceId, opts) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      maxWidth: opts.width || 1920,
      maxHeight: opts.height || 1080,
      maxFrameRate: 30,
    },
  };
}

function audioConstraints(sourceId) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
    },
  };
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function isGameWindowName(name) {
  const n = String(name || '').trim();
  if (/Riot Client/i.test(n)) return false;
  if (/League of Legends \(TM\) Client/i.test(n)) return true;
  if (/League of Legends \(TM\)/i.test(n)) return true;
  if (/^TFT\b/i.test(n)) return true;
  if (/Teamfight Tactics/i.test(n)) return true;
  return false;
}

function pickLocalSource(sources, fallbackId) {
  const game = sources.find((s) => isGameWindowName(s.name))
    || sources.find((s) => s.id === fallbackId);
  const screens = sources.filter((s) => String(s.id).startsWith('screen:'));
  const screenSource = screens[0] || sources.find((s) => /Entire screen|Screen \d/i.test(s.name));
  return {
    id: game?.id || null,
    name: game?.name || '',
    audioSourceId: game?.id || null,
    loopbackSourceId: screenSource ? screenSource.id : null,
    screens,
  };
}

async function openAudio(sourceId) {
  if (!sourceId) return null;
  try {
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(sourceId),
      video: false,
    });
    if (audio.getAudioTracks().length) return audio;
    audio.getTracks().forEach((t) => t.stop());
  } catch { /* window sources often have no audio on Windows */ }
  return null;
}

async function openVideo(sourceId, opts, ms, label) {
  return withTimeout(
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints(sourceId, opts),
    }),
    ms,
    `Timed out capturing ${label}.`,
  );
}

async function openStream(opts) {
  let sources = [];
  try {
    if (typeof window.recorderBridge.getSources === 'function') {
      sources = await window.recorderBridge.getSources() || [];
    }
  } catch {
    sources = [];
  }
  const picked = pickLocalSource(sources, opts.sourceId);
  const windowId = [picked.id, opts.sourceId].find((id) => String(id || '').startsWith('window:'));
  if (!windowId) {
    const names = sources.filter((s) => String(s.id).startsWith('window:')).map((s) => s.name).filter(Boolean);
    throw new Error(
      names.length
        ? `League of Legends (TM) Client is not in the window list. Visible: ${names.slice(0, 8).join(', ')}`
        : 'League of Legends (TM) Client was not found. Use borderless or windowed mode.',
    );
  }

  const video = await openVideo(windowId, opts, 8000, `"${picked.name || 'League of Legends (TM) Client'}"`);
  const surface = video.getVideoTracks()[0]?.getSettings?.().displaySurface;
  if (surface && surface !== 'window' && surface !== 'browser') {
    video.getTracks().forEach((t) => t.stop());
    throw new Error('Capture attached to the monitor instead of League of Legends (TM) Client.');
  }
  const screenId = opts.loopbackSourceId || picked.loopbackSourceId;
  const audioIds = [picked.audioSourceId || opts.audioSourceId, windowId, screenId];
  const tried = new Set();
  for (const audioId of audioIds) {
    if (!audioId || tried.has(audioId)) continue;
    tried.add(audioId);
    const audio = await openAudio(audioId);
    if (audio) {
      return {
        stream: new MediaStream([
          ...video.getVideoTracks(),
          ...audio.getAudioTracks(),
        ]),
        via: 'window',
      };
    }
  }
  return { stream: video, via: 'window' };
}

function pickMime(hasAudio) {
  const types = hasAudio
    ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
}

function queueWrite(blob) {
  writes = writes.then(async () => {
    if (!blob || !blob.size) return;
    const bytes = await blob.arrayBuffer();
    const n = window.recorderBridge.append(bytes);
    if (n) window.recorderBridge.progress({ bytes: n, gameTime, file: outName });
  }).catch(() => {});
  return writes;
}

async function start(opts) {
  await stop(true);
  const id = ++runId;
  if (id !== runId) return;

  gameTime = Number(opts.gameTime) || 0;
  outName = null;
  writes = Promise.resolve();
  wantPause = false;
  armedPause = false;
  const opened = await openStream(opts);
  mediaStream = opened.stream;
  if (id !== runId) {
    teardownStream();
    return;
  }

  const hasAudio = mediaStream.getAudioTracks().length > 0;
  const mime = pickMime(hasAudio);
  try {
    recorder = new MediaRecorder(mediaStream, {
      mimeType: mime,
      videoBitsPerSecond: opts.bitrate || 4_000_000,
      audioBitsPerSecond: hasAudio ? 160000 : undefined,
    });
  } catch {
    recorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
  }
  outName = 'match.webm';
  if (!window.recorderBridge.setFile(outName)) {
    throw new Error('Could not open the replay file for writing.');
  }

  recorder.ondataavailable = (e) => {
    if (id !== runId) return;
    queueWrite(e.data);
  };
  recorder.onerror = (e) => {
    window.recorderBridge.error((e.error && e.error.message) || 'MediaRecorder failed');
  };
  recorder.onstop = () => {
    clearInterval(flushTimer);
    flushTimer = null;
    writes.then(() => {
      try { window.recorderBridge.closeFile(); } catch { /* ignore */ }
      teardownStream();
      window.recorderBridge.stopped();
    });
  };

  recorder.start(1000);
  flushTimer = setInterval(() => {
    if (recorder && recorder.state === 'recording') {
      try { recorder.requestData(); } catch { /* ignore */ }
    }
  }, 1000);
  window.recorderBridge.started({
    mime,
    audio: hasAudio,
    container: 'webm',
    file: outName,
    via: opened.via,
  });
}

function teardownStream() {
  clearInterval(flushTimer);
  flushTimer = null;
  try {
    (mediaStream?.getTracks() || []).forEach((t) => t.stop());
  } catch { /* ignore */ }
  mediaStream = null;
  recorder = null;
}

function stop(silent) {
  runId += 1;
  return new Promise((resolve) => {
    clearInterval(flushTimer);
    flushTimer = null;
    const rec = recorder;
    if (!rec || rec.state === 'inactive') {
      writes.then(() => {
        try { window.recorderBridge.closeFile(); } catch { /* ignore */ }
        teardownStream();
        if (!silent) window.recorderBridge.stopped();
        resolve();
      });
      return;
    }
    rec.addEventListener('stop', () => resolve(), { once: true });
    try { rec.requestData(); } catch { /* ignore */ }
    try { rec.stop(); } catch {
      writes.then(() => {
        try { window.recorderBridge.closeFile(); } catch { /* ignore */ }
        teardownStream();
        if (!silent) window.recorderBridge.stopped();
        resolve();
      });
    }
  });
}
