const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  powerSaveBlocker,
  protocol,
  shell,
  screen,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { getRecorderTick } = require('./live-client');
const store = require('./replays-store');
const { patchWebmFile, sliceWebmFile } = require('./webm-duration');
const {
  makeSeekableMp4,
  probeDurationSec,
  startWindowGrab,
  startDesktopRegionGrab,
  stopDesktopGrab,
  cutClip,
} = require('./ffmpeg-seekable');
const { getLeagueBounds, startLeagueWatcher, stopLeagueWatcher } = require('./league-window');

const ENABLED = true;
const CLUSTER = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
const POLL_MS = 1000;
const DEBOUNCE_S = 4;
const BITRATE = 4_000_000;

let recWin = null;
let pollTimer = null;
let session = null;
let powerId = null;
let offGameStreak = 0;
let windowGoneStreak = 0;
let lastStatus = idleStatus();
let protocolReady = false;
let lastStartAttempt = 0;
let readyWait = null;

function idleStatus(extra = {}) {
  return {
    disabled: !ENABLED,
    recording: false,
    inGame: false,
    you: '',
    champion: '',
    gameMode: '',
    gameTime: 0,
    source: '',
    error: null,
    warning: null,
    ...extra,
  };
}

function finishIdle(extra = {}) {
  unbindSaveHotkey();
  try { stopLeagueWatcher(); } catch { /* ignore */ }
  broadcast(idleStatus(extra));
}

function prepare() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'gdreplay',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
  if (!ENABLED) return;
  app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

function fileMime(filePath) {
  if (/\.mp4$/i.test(filePath)) return 'video/mp4';
  if (/\.webm$/i.test(filePath)) return 'video/webm';
  return 'application/octet-stream';
}

function parseByteRange(header, size) {
  const m = String(header || '').match(/bytes=(\d*)-(\d*)/i);
  if (!m) return null;
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start < 0) return null;
  return { start, end: Math.min(end, size - 1) };
}

function streamResponse(filePath, status, headers, start, end) {
  const h = headers instanceof Headers ? headers : new Headers(headers);
  try {
    const stream = fs.createReadStream(filePath, start != null ? { start, end } : undefined);
    return new Response(Readable.toWeb(stream), { status, headers: h });
  } catch {
    const buf = fs.readFileSync(filePath);
    const slice = start != null ? buf.subarray(start, end + 1) : buf;
    return new Response(slice, { status, headers: h });
  }
}

function replayHeaders(mime, extra = {}) {
  return {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
    'Cache-Control': 'no-cache',
    ...extra,
  };
}

function registerProtocol() {
  if (protocolReady) return;
  protocolReady = true;
  const serve = (requestUrl) => {
    const u = new URL(requestUrl);
    const rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    const root = store.rootDir();
    const full = path.resolve(root, rel);
    const a = root.toLowerCase();
    const b = full.toLowerCase();
    if (b !== a && !b.startsWith(a + path.sep.toLowerCase())) {
      return { error: 403 };
    }
    if (!fs.existsSync(full)) return { error: 404 };
    return { full };
  };
  try {
    protocol.handle('gdreplay', (request) => {
      const result = serve(request.url);
      if (result.error === 403) return new Response('Forbidden', { status: 403 });
      if (result.error) return new Response('Not found', { status: 404 });
      const full = result.full;
      const size = fs.statSync(full).size;
      const mime = fileMime(full);
      const rangeHeader = request.headers.get('Range') || request.headers.get('range') || '';
      const range = parseByteRange(rangeHeader, size);
      if (range) {
        return streamResponse(full, 206, replayHeaders(mime, {
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Content-Length': String(range.end - range.start + 1),
        }), range.start, range.end);
      }
      return streamResponse(full, 200, replayHeaders(mime, {
        'Content-Length': String(size),
      }));
    });
  } catch {
    protocol.registerFileProtocol('gdreplay', (request, callback) => {
      const result = serve(request.url);
      if (result.full) callback({ path: result.full });
      else callback({ error: result.error || 400 });
    });
  }
}

function sendTo(win, channel, payload) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.webContents.isDestroyed()) return;
    win.webContents.send(channel, payload);
  } catch { /* render frame disposed */ }
}

function sendRecorder(channel, payload) {
  sendTo(recWin, channel, payload);
}

function broadcast(status) {
  lastStatus = { ...lastStatus, ...status, recording: !!session };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === recWin || win.isDestroyed()) continue;
    sendTo(win, 'replays:status', getStatus());
  }
}

function getStatus() {
  const settings = store.getSettings();
  const pauseMsg = 'Replays are paused until capture is fixed.';
  let error = lastStatus.error;
  // Drop the old kill-switch banner once capture is re-enabled.
  if (ENABLED && error === pauseMsg) error = null;
  return {
    ...lastStatus,
    disabled: !ENABLED,
    error,
    recording: !!session,
    paused: !!session?.paused,
    finalizing: stopping && !!session,
    autoRecord: settings.autoRecord,
    clipKills: settings.clipKills,
    folder: store.rootDir(),
  };
}

function extractInit(buf) {
  const idx = buf.indexOf(CLUSTER);
  if (idx <= 0) return { init: buf, rest: Buffer.alloc(0) };
  return { init: buf.subarray(0, idx), rest: buf.subarray(idx) };
}

function matchRel(sessionLike = session) {
  return sessionLike?.container === 'mp4' ? 'match.mp4' : 'match.webm';
}

function pad(n) {
  return String(n).padStart(6, '0');
}

function sessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureRecorderWindow() {
  if (recWin && !recWin.isDestroyed()) return recWin;
  // Park off-screen. Never use { forward: true } here — on Windows that
  // subclass flickers the system cursor for every mouse move while capture runs.
  recWin = new BrowserWindow({
    width: 72,
    height: 72,
    x: -12000,
    y: -12000,
    show: false,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    focusable: false,
    fullscreenable: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'recorder-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  recWin.setIgnoreMouseEvents(true);
  recWin.setMenuBarVisibility(false);
  recWin.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'clipboard-read');
  });
  recWin.webContents.session.setPermissionCheckHandler(() => true);
  recWin.loadFile(path.join(__dirname, 'recorder.html'));
  recWin.on('closed', () => { recWin = null; });
  return recWin;
}

function waitForRecorder() {
  const win = ensureRecorderWindow();
  if (!win.webContents.isLoading()) return Promise.resolve(win);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Recorder window timed out')), 8000);
    win.webContents.once('did-finish-load', () => {
      clearTimeout(t);
      resolve(win);
    });
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(t);
      reject(new Error(desc || `Recorder failed (${code})`));
    });
  });
}

async function leagueCrop() {
  try {
    const bounds = await getLeagueBounds();
    if (!bounds?.hasRect) return null;
    let display = screen.getPrimaryDisplay();
    try {
      const dip = screen.screenToDipPoint({ x: bounds.x, y: bounds.y });
      display = screen.getDisplayNearestPoint(dip);
    } catch { /* primary */ }
    let phys = {
      x: Math.round(display.bounds.x * (display.scaleFactor || 1)),
      y: Math.round(display.bounds.y * (display.scaleFactor || 1)),
      width: Math.round(display.size.width * (display.scaleFactor || 1)),
      height: Math.round(display.size.height * (display.scaleFactor || 1)),
    };
    try {
      const rect = screen.dipToScreenRect(null, display.bounds);
      if (rect?.width) phys = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    } catch { /* keep scaled bounds */ }
    const x = Math.max(0, Math.round(bounds.x - phys.x));
    const y = Math.max(0, Math.round(bounds.y - phys.y));
    const width = Math.min(phys.width - x, Math.round(bounds.width));
    const height = Math.min(phys.height - y, Math.round(bounds.height));
    if (width < 320 || height < 180) return null;
    return {
      x,
      y,
      width,
      height,
      displayWidth: phys.width,
      displayHeight: phys.height,
      displayId: display.id,
    };
  } catch {
    return null;
  }
}

async function captureSize() {
  try {
    const bounds = await getLeagueBounds();
    if (bounds?.hasRect && bounds.width >= 640 && bounds.height >= 360) {
      return {
        width: Math.min(1920, Math.round(bounds.width)),
        height: Math.min(1080, Math.round(bounds.height)),
      };
    }
  } catch { /* ignore */ }
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    return {
      width: Math.min(1920, Math.max(1280, width)),
      height: Math.min(1080, Math.max(720, height)),
    };
  } catch {
    return { width: 1920, height: 1080 };
  }
}

function isGameWindowName(name) {
  const n = String(name || '').trim();
  if (/Riot Client/i.test(n)) return false;
  if (/League of Legends \(TM\) Client/i.test(n)) return true;
  if (/League of Legends \(TM\)/i.test(n)) return true;
  // TFT (Unreal) window title is usually just "TFT".
  if (/^TFT\b/i.test(n)) return true;
  if (/Teamfight Tactics/i.test(n)) return true;
  return false;
}

function isTftSourceName(name) {
  const n = String(name || '').trim();
  return /^TFT\b/i.test(n) || /Teamfight Tactics/i.test(n);
}

function inferGameMode(tick = {}, sourceName = '') {
  const fromTick = String(tick.gameMode || '').trim();
  if (fromTick) return fromTick;
  if (isTftSourceName(sourceName)) return 'TFT';
  if (/League of Legends/i.test(sourceName)) return 'CLASSIC';
  return '';
}

async function waitForLeagueCrop(ms = 1800) {
  const t0 = Date.now();
  let crop = await leagueCrop();
  while (!crop && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 200));
    crop = await leagueCrop();
  }
  return crop;
}

async function listCaptureSources(types = ['screen', 'window']) {
  try {
    const api = desktopCapturer || require('electron').desktopCapturer;
    if (!api?.getSources) return [];
    const sources = await api.getSources({
      types,
      thumbnailSize: { width: 0, height: 0 },
    });
    return Array.isArray(sources) ? sources : [];
  } catch {
    return [];
  }
}

async function pickSource() {
  const crop = await waitForLeagueCrop();
  const windows = await listCaptureSources(['window']);
  const game = windows.find((s) => isGameWindowName(s.name));
  if (!game) return null;
  let screenSource = null;
  try {
    const screens = await listCaptureSources(['screen']);
    const wantedId = crop?.displayId != null ? crop.displayId : screen.getPrimaryDisplay().id;
    screenSource = screens.find((s) => String(s.display_id) === String(wantedId))
      || screens[0]
      || screens.find((s) => /Entire screen|Screen \d/i.test(s.name));
  } catch { /* audio loopback is optional */ }
  return {
    id: game.id,
    name: game.name,
    kind: 'window',
    audioSourceId: game.id,
    loopbackSourceId: screenSource ? screenSource.id : null,
    crop,
  };
}

async function leagueGameOpen() {
  try {
    const bounds = await getLeagueBounds();
    if (bounds?.running || bounds?.hasRect) return true;
    if (bounds && bounds.running === false && bounds.hasRect === false) {
      const sources = await listCaptureSources(['window']);
      return sources.some((s) => isGameWindowName(s.name));
    }
  } catch { /* ignore */ }
  try {
    const sources = await listCaptureSources(['window']);
    return sources.some((s) => isGameWindowName(s.name));
  } catch {
    return false;
  }
}

function writeChunk(buf, gameTime, index) {
  if (!session) return;
  const rel = path.join('chunks', `${pad(index)}.bin`);
  const full = path.join(session.dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buf);
  session.chunks.push({ index, gameTime, rel, bytes: buf.length });
}

function sniffContainer(buf) {
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45) return 'webm';
  return null;
}

function onChunk(payload) {
  if (!session || !payload?.bytes) return;
  const buf = Buffer.from(payload.bytes);
  if (!buf.length) return;
  const gameTime = Number(payload.gameTime) || session.gameTime || 0;
  if (!session.container) session.container = sniffContainer(buf) || 'webm';

  if (payload.complete) {
    const ext = session.container === 'mp4' ? 'mp4' : 'webm';
    const i = session.segments.length;
    const rel = path.join('seg', `${pad(i)}.${ext}`).replace(/\\/g, '/');
    fs.mkdirSync(path.join(session.dir, 'seg'), { recursive: true });
    fs.writeFileSync(path.join(session.dir, rel), buf);
    const prev = session.segments[i - 1];
    const start = prev ? Number(prev.start) + Number(prev.duration) : 0;
    const duration = Number(payload.duration) > 0 ? Number(payload.duration) : 3;
    session.segments.push({
      file: rel,
      start,
      duration,
      bytes: buf.length,
      gameTime,
    });
    session.bytes = (session.bytes || 0) + buf.length;
    session.matchFile = session.matchFile || rel;
    persistSession({
      segments: session.segments,
      bytes: session.bytes,
      matchFile: session.matchFile,
    });
    return;
  }

  const rel = matchRel();
  fs.appendFileSync(path.join(session.dir, rel), buf);
  session.matchFile = rel;
  session.bytes = (session.bytes || 0) + buf.length;
  session.chunks.push({ index: session.chunks.length, gameTime, bytes: buf.length });
}

function chunksInRange(startGt, endGt) {
  if (!session) return [];
  return session.chunks.filter((c) => c.gameTime + 1.2 >= startGt && c.gameTime - 0.2 <= endGt);
}

function assembleWebm(chunkRows) {
  if (!session?.init) return null;
  const parts = [session.init];
  for (const row of chunkRows) {
    const full = path.join(session.dir, row.rel);
    if (fs.existsSync(full)) parts.push(fs.readFileSync(full));
  }
  if (parts.length < 2) return null;
  return Buffer.concat(parts);
}

function clipRank(type, label = '') {
  const s = `${type} ${label}`.toLowerCase();
  if (s.includes('penta')) return 100;
  if (s.includes('quadra')) return 90;
  if (s.includes('triple')) return 80;
  if (s.includes('double') || type === 'multikill') return 70;
  if (type === 'baron') return 60;
  if (type === 'dragon') return 55;
  if (type === 'firstblood') return 40;
  if (type === 'tower') return 30;
  return 10;
}

function clipLabel(pending, ev) {
  if (!pending?.label) return ev.label;
  return clipRank(ev.type, ev.label) >= clipRank('', pending.label) ? ev.label : pending.label;
}

function videoTimeSec() {
  if (!session) return 0;
  const extra = session.pauseAt ? (Date.now() - session.pauseAt) : 0;
  return Math.max(0, (Date.now() - session.startedAt - (session.pausedMs || 0) - extra) / 1000);
}

function setFfmpegSuspended(proc, suspend) {
  if (!proc?.pid || process.platform !== 'win32') return;
  if (!!proc.__riftSuspended === !!suspend) return;
  proc.__riftSuspended = !!suspend;
  const fn = suspend ? 'NtSuspendProcess' : 'NtResumeProcess';
  try {
    spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class RiftNt{[DllImport("ntdll.dll")]public static extern int NtSuspendProcess(IntPtr p);[DllImport("ntdll.dll")]public static extern int NtResumeProcess(IntPtr p);[DllImport("kernel32.dll")]public static extern IntPtr OpenProcess(uint a,bool b,int pid);[DllImport("kernel32.dll")]public static extern bool CloseHandle(IntPtr h);public static void Go(int pid,bool s){var h=OpenProcess(0x0800,false,pid);if(h==IntPtr.Zero)return;if(s)NtSuspendProcess(h);else NtResumeProcess(h);CloseHandle(h);}}'; [RiftNt]::Go(${proc.pid}, $${suspend ? 'true' : 'false'})`,
    ], { windowsHide: true, stdio: 'ignore' });
  } catch {
    proc.__riftSuspended = !suspend;
  }
}

function noteFocus(_focused) {
  // Keep recording through alt-tab; do not pause or suspend capture.
}

function noteTimeline(ev) {
  if (!session) return;
  if (!Array.isArray(session.timeline)) session.timeline = [];
  const id = String(ev?.id ?? '');
  if (id && session.timeline.some((row) => String(row.id) === id)) return;
  session.timeline.push({
    id: id || `e-${Date.now().toString(36)}`,
    type: ev.type || 'event',
    label: ev.label || 'Event',
    at: videoTimeSec(),
    gameTime: Number(ev.time) || session.gameTime || 0,
  });
  persistSession({ timeline: session.timeline });
}

function queueClip(ev) {
  if (!session || !store.getSettings().clipKills) return;
  if (ev?.type === 'death') return; // timeline marker only
  const t = videoTimeSec();
  const settings = store.getSettings();
  if (session.pending && t - session.pending.lastTime < DEBOUNCE_S) {
    session.pending.lastTime = t;
    session.pending.end = t + settings.postSeconds;
    session.pending.label = clipLabel(session.pending, ev);
    session.pending.types.push(ev.type);
    scheduleFlush();
    return;
  }
  flushPending();
  session.pending = {
    start: Math.max(0, t - settings.preSeconds),
    end: t + settings.postSeconds,
    lastTime: t,
    gameTime: Number(ev.time) || session.gameTime || 0,
    label: ev.label || 'Kill',
    types: [ev.type],
  };
  scheduleFlush();
}

function scheduleFlush() {
  if (!session) return;
  clearTimeout(session.clipTimer);
  const wait = (store.getSettings().postSeconds * 1000) + 700;
  session.clipTimer = setTimeout(() => {
    flushPending();
  }, wait);
}

function flushPending() {
  if (!session?.pending) return;
  const pending = session.pending;
  session.pending = null;
  clearTimeout(session.clipTimer);
  session.clipTimer = null;
  writeClip(pending);
}

function writeClip(pending) {
  if (!session) return;
  const duration = Math.max(1, pending.end - pending.start);
  session.clips.push({
    id: `k-${Date.now().toString(36)}`,
    label: pending.label,
    gameTime: pending.gameTime || pending.lastTime,
    duration,
    start: pending.start,
    file: session.matchFile || matchRel(),
  });
  persistSession({ clips: session.clips });
}

function saveMomentNow(label = 'Manual') {
  if (!session) return { ok: false, error: 'Not recording' };
  const settings = store.getSettings();
  const t = videoTimeSec();
  writeClip({
    start: Math.max(0, t - settings.preSeconds),
    end: t + settings.postSeconds,
    lastTime: t,
    gameTime: session.gameTime || t,
    label,
    types: ['manual'],
  });
  broadcast({ recording: true, clips: session.clips?.length || 0 });
  return { ok: true };
}

function bindSaveHotkey() {
  try { globalShortcut.unregister('F10'); } catch { /* ignore */ }
  try {
    globalShortcut.register('F10', () => {
      if (!session) return;
      saveMomentNow('Manual');
    });
  } catch { /* ignore */ }
}

function unbindSaveHotkey() {
  try { globalShortcut.unregister('F10'); } catch { /* ignore */ }
}

function folderBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else {
        try { total += fs.statSync(full).size; } catch { /* ignore */ }
      }
    }
  }
  return total;
}

function diskInfo() {
  const root = store.rootDir();
  const used = folderBytes(root);
  let free = 0;
  let total = 0;
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(root);
      const bsize = Number(s.bsize) || 4096;
      free = Number(s.bavail) * bsize;
      total = Number(s.blocks) * bsize;
    }
  } catch { /* ignore */ }
  if (!total) total = used + free;
  return { used, free, total, root };
}

function persistSession(patch = {}) {
  if (!session) return;
  store.upsertMatch({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt || null,
    you: session.you,
    champion: session.champion,
    gameMode: session.gameMode,
    duration: session.gameTime || 0,
    matchFile: session.matchFile || null,
    bytes: session.bytes || 0,
    source: session.sourceName,
    warning: session.warning || null,
    error: session.error || null,
    clips: session.clips,
    timeline: session.timeline || [],
    segments: session.segments || [],
    container: session.container || null,
    ...patch,
  });
}

function friendlyCaptureError(err) {
  const msg = String(err?.message || err || '');
  if (!msg) return '';
  if (msg.includes('getSources') || msg.toLowerCase().includes('desktopcapturer')) {
    return 'Could not start capture. Fully quit Rift.lol and press Record now again while League is visible in borderless.';
  }
  return msg;
}

async function startFfmpegFallback(current) {
  const outPath = path.join(current.dir, 'match.mp4');
  const attempts = [];

  try {
    const bounds = await getLeagueBounds();
    if (bounds?.hasRect && bounds.width >= 320 && bounds.height >= 180) {
      attempts.push({
        kind: 'region',
        label: current.sourceName || 'game region',
        start: () => startDesktopRegionGrab({
          outPath,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        }),
      });
    }
  } catch { /* title fallbacks below */ }

  const titles = [
    current.sourceName,
    'League of Legends (TM) Client',
    'TFT',
    'TFT  ',
  ].filter((t, i, arr) => t && arr.indexOf(t) === i);
  for (const title of titles) {
    attempts.push({
      kind: 'title',
      label: title,
      start: () => startWindowGrab({ outPath, title }),
    });
  }

  let lastErr = '';
  for (const attempt of attempts) {
    const proc = attempt.start();
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += String(d); });
    current.ffmpegProc = proc;
    current.matchFile = 'match.mp4';
    current.container = 'mp4';
    current.sourceName = attempt.label;
    current.viaFfmpegRegion = attempt.kind === 'region';
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < 6000) {
      if (proc.exitCode != null) {
        lastErr = stderr.trim() || `ffmpeg could not grab "${attempt.label}".`;
        break;
      }
      if (fileSize(outPath) > 4000) {
        ok = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (ok) {
      current.ready = true;
      current.error = null;
      current.viaFfmpeg = true;
      current.warning = attempt.kind === 'region'
        ? `Recording ${attempt.label}. Capture keeps running if you alt-tab.`
        : `Recording ${attempt.label}. Capture keeps running if you alt-tab.`;
      persistSession({ matchFile: current.matchFile, container: 'mp4', warning: current.warning });
      return;
    }
    try { await stopDesktopGrab(proc); } catch { /* ignore */ }
    current.ffmpegProc = null;
    current.viaFfmpegRegion = false;
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ignore */ }
  }
  throw new Error(lastErr || 'ffmpeg did not start capturing the League/TFT window.');
}

async function startSession(tick = {}, { manual } = {}) {
  if (!ENABLED) {
    broadcast({ error: 'Replays are paused until capture is fixed.' });
    return getStatus();
  }
  if (session) return getStatus();
  let source = null;
  try {
    source = await pickSource();
  } catch (err) {
    broadcast({ error: friendlyCaptureError(err) || 'Could not find the League window.' });
    return getStatus();
  }
  if (!source) {
    broadcast({
      error: 'Waiting for the League or TFT game window. Load into a match in borderless / windowed fullscreen — exclusive fullscreen and the Riot launcher cannot be captured.',
    });
    return getStatus();
  }

  const id = sessionId();
  const dir = store.matchDir(id);
  fs.mkdirSync(path.join(dir, 'chunks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'seg'), { recursive: true });

  session = {
    id,
    dir,
    startedAt: Date.now(),
    endedAt: null,
    you: tick.you || '',
    champion: tick.champion || (isTftSourceName(source.name) ? 'TFT' : ''),
    gameMode: inferGameMode(tick, source.name),
    gameTime: tick.gameTime || 0,
    sourceName: source.name,
    warning: 'Recording the game window. Borderless / windowed fullscreen works; exclusive fullscreen often cannot be captured.',
    error: null,
    init: null,
    container: null,
    chunks: [],
    clips: [],
    timeline: [],
    segments: [],
    lastSegAt: Date.now(),
    seen: new Set(),
    seenGame: false,
    pending: null,
    clipTimer: null,
    matchFile: null,
    bytes: 0,
    manual: !!manual,
    ready: false,
    crop: source.crop || null,
    ffmpegProc: null,
    pausedMs: 0,
    pauseAt: 0,
    seenFocused: false,
  };

  persistSession();
  if (powerId == null) {
    try { powerId = powerSaveBlocker.start('prevent-app-suspension'); } catch { powerId = null; }
  }

  broadcast({
    recording: false,
    warning: 'Starting game window capture…',
    error: null,
    source: source.name,
  });

  try {
    await waitForRecorder();
    const size = await captureSize();
    sendRecorder('recorder:start', {
      sourceId: source.id,
      audioSourceId: source.audioSourceId || source.id,
      loopbackSourceId: source.loopbackSourceId || null,
      crop: source.crop || null,
      bitrate: BITRATE,
      width: size.width,
      height: size.height,
      dir: session.dir,
      gameTime: session.gameTime,
    });
    await waitForCaptureReady(12000);
  } catch (err) {
    if (!session || stopping) return getStatus();
    try {
      await stopRecorderPage();
      await startFfmpegFallback(session);
    } catch (ffmpegErr) {
      return abortSession(friendlyCaptureError(err) || friendlyCaptureError(ffmpegErr) || 'Capture did not start.');
    }
  }

  if (!session?.ready) {
    try {
      await startFfmpegFallback(session);
    } catch (err) {
      return abortSession(session?.error || friendlyCaptureError(err) || 'Capture did not start.');
    }
  }

  broadcast({
    recording: true,
    inGame: !!tick.inGame,
    you: session.you,
    champion: session.champion,
    gameTime: session.gameTime,
    source: source.name,
    error: null,
    warning: session.warning,
  });
  bindSaveHotkey();
  try {
    const bounds = await getLeagueBounds();
    if (bounds?.focused) {
      session.seenFocused = true;
      sendRecorder('recorder:focus', true);
    }
  } catch { /* ignore */ }
  return getStatus();
}

function concatMatch() {
  if (!session?.init) return null;
  const outPath = path.join(session.dir, 'match.webm');
  const out = fs.createWriteStream(outPath);
  out.write(session.init);
  for (const row of session.chunks) {
    const full = path.join(session.dir, row.rel);
    if (fs.existsSync(full)) out.write(fs.readFileSync(full));
  }
  return new Promise((resolve, reject) => {
    out.end();
    out.on('finish', () => resolve(outPath));
    out.on('error', reject);
  });
}

function cleanupChunks(dir) {
  try {
    fs.rmSync(path.join(dir, 'chunks'), { recursive: true, force: true });
    fs.rmSync(path.join(dir, 'init.webm'), { force: true });
  } catch { /* ignore */ }
}

function resolveReady(err) {
  const wait = readyWait;
  readyWait = null;
  if (!wait) return;
  if (err) wait.reject(err);
  else wait.resolve();
}

function waitForCaptureReady(ms) {
  if (session?.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      readyWait = null;
      reject(new Error('Capture timed out. The League window was found, but Windows never started the capture. Fully quit Rift.lol and try Record now again while the game window is visible.'));
    }, ms);
    readyWait = {
      resolve: () => { clearTimeout(t); resolve(); },
      reject: (err) => { clearTimeout(t); reject(err); },
    };
  });
}

function fileSize(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

let stopWait = null;
let stopping = false;
let quitting = false;

function stopRecorderPage() {
  return new Promise((resolve) => {
    if (!recWin || recWin.isDestroyed()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stopWait = null;
      resolve();
    };
    stopWait = finish;
    setTimeout(finish, 8000);
    sendRecorder('recorder:stop');
  });
}

async function abortSession(message) {
  const current = session;
  stopping = true;
  resolveReady(new Error(message));
  try { setFfmpegSuspended(current?.ffmpegProc, false); } catch { /* ignore */ }
  try { await stopDesktopGrab(current?.ffmpegProc); } catch { /* ignore */ }
  try { await stopRecorderPage(); } catch { /* ignore */ }
  session = null;
  stopping = false;
  lastStartAttempt = 0;
  if (current?.id) {
    try { store.removeMatch(current.id); } catch { /* ignore */ }
  }
  if (current?.dir) {
    try { fs.rmSync(current.dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  if (powerId != null) {
    try { powerSaveBlocker.stop(powerId); } catch { /* ignore */ }
    powerId = null;
  }
  finishIdle({ error: message });
  return getStatus();
}

async function stopSession() {
  if (!session || stopping) return getStatus();
  stopping = true;
  resolveReady(new Error('Recording stopped'));
  const current = session;
  flushPending();
  try { setFfmpegSuspended(current.ffmpegProc, false); } catch { /* ignore */ }
  try { await stopDesktopGrab(current.ffmpegProc); } catch { /* ignore */ }
  current.ffmpegProc = null;
  await stopRecorderPage();
  await new Promise((r) => setTimeout(r, 800));
  flushPending();

  current.endedAt = Date.now();
  const savedPath = current.matchFile ? path.join(current.dir, current.matchFile) : null;
  current.bytes = Math.max(current.bytes || 0, fileSize(savedPath));
  if (!savedPath || current.bytes < 20000) {
    const message = current.error
      || 'Nothing was captured. Keep League of Legends (TM) Client in borderless or windowed mode and try Record now again.';
    session = null;
    stopping = false;
    offGameStreak = 0;
    windowGoneStreak = 0;
    lastStartAttempt = 0;
    try { store.removeMatch(current.id); } catch { /* ignore */ }
    try { fs.rmSync(current.dir, { recursive: true, force: true }); } catch { /* ignore */ }
    if (powerId != null) {
      try { powerSaveBlocker.stop(powerId); } catch { /* ignore */ }
      powerId = null;
    }
    finishIdle({ error: message });
    return getStatus();
  }

  broadcast({
    recording: true,
    warning: 'Finalizing skippable MP4…',
    error: null,
  });

  try {
    if (!current.matchFile && current.init) {
      const matchFile = await concatMatch();
      if (matchFile) current.matchFile = 'match.webm';
    }
    if (current.matchFile) {
      const full = path.join(current.dir, current.matchFile);
      current.bytes = fs.existsSync(full) ? fs.statSync(full).size : current.bytes;
    }
    try {
      const seekable = await makeSeekableMp4(current.dir, {
        matchFile: current.matchFile,
        segments: current.segments,
      });
      if (seekable) {
        current.matchFile = 'seekable.mp4';
        current.bytes = fs.statSync(seekable).size;
        current.container = 'mp4';
        const probed = await probeDurationSec(seekable);
        if (probed > 0.4) current.duration = probed;
      }
    } catch (err) {
      current.warning = `Clip saved, but skip needs a rebuild: ${String(err.message || err).slice(0, 180)}`;
    }
    if (!current.duration && current.matchFile) {
      const probed = await probeDurationSec(path.join(current.dir, current.matchFile));
      if (probed > 0.4) current.duration = probed;
    }
    const playable = current.matchFile === 'seekable.mp4' || /\.mp4$/i.test(current.matchFile || '');
    if ((current.bytes || 0) < 80000 || !current.duration || current.duration < 1.2 || !playable) {
      const message = current.error
        || (!playable
          ? 'The clip saved but could not be made skippable. Record again in borderless and press Stop after a few seconds of real gameplay.'
          : 'Almost no video was captured. Click Record while League is focused in borderless, then stay in the game until you press Stop.');
      session = null;
      stopping = false;
      offGameStreak = 0;
      windowGoneStreak = 0;
      lastStartAttempt = 0;
      try { store.removeMatch(current.id); } catch { /* ignore */ }
      try { fs.rmSync(current.dir, { recursive: true, force: true }); } catch { /* ignore */ }
      if (powerId != null) {
        try { powerSaveBlocker.stop(powerId); } catch { /* ignore */ }
        powerId = null;
      }
      finishIdle({ error: message });
      return getStatus();
    }
    const src = current.matchFile ? path.join(current.dir, current.matchFile) : null;
    if (src && fs.existsSync(src) && current.clips?.length) {
      for (const clip of current.clips) {
        const rel = path.join('clips', `${clip.id}.mp4`).replace(/\\/g, '/');
        try {
          await cutClip(src, path.join(current.dir, rel), clip.start || 0, clip.duration || 12);
          clip.file = rel;
        } catch { /* keep timestamp on the full match */ }
      }
    }
    cleanupChunks(current.dir);
  } catch (err) {
    current.error = current.error || err.message;
  }

  store.upsertMatch({
    id: current.id,
    startedAt: current.startedAt,
    endedAt: current.endedAt,
    you: current.you,
    champion: current.champion,
    gameMode: current.gameMode,
    duration: current.duration || current.gameTime || 0,
    matchFile: current.matchFile,
    bytes: current.bytes,
    source: current.sourceName,
    warning: current.warning,
    error: current.error,
    clips: current.clips,
    timeline: current.timeline || [],
    segments: current.segments || [],
    container: current.container || null,
  });

  if (!current.matchFile && !current.clips.length && !current.segments?.length) {
    const message = current.error
      || 'Nothing was captured. Keep League of Legends (TM) Client in borderless or windowed mode and try Record now again.';
    try { fs.rmSync(current.dir, { recursive: true, force: true }); } catch { /* ignore */ }
    store.removeMatch(current.id);
    session = null;
    stopping = false;
    offGameStreak = 0;
    windowGoneStreak = 0;
    lastStartAttempt = 0;
    if (powerId != null) {
      try { powerSaveBlocker.stop(powerId); } catch { /* ignore */ }
      powerId = null;
    }
    finishIdle({ error: message });
    return getStatus();
  }

  session = null;
  stopping = false;
  offGameStreak = 0;
  windowGoneStreak = 0;
  lastStartAttempt = 0;
  if (powerId != null) {
    try { powerSaveBlocker.stop(powerId); } catch { /* ignore */ }
    powerId = null;
  }
  finishIdle({ error: current.error || null });
  return getStatus();
}

function handleTick(tick, leagueOpen, leagueFocused) {
  lastStatus.inGame = !!tick.inGame;
  if (tick.inGame) {
    lastStatus.you = tick.you || lastStatus.you;
    lastStatus.champion = tick.champion || lastStatus.champion;
    lastStatus.gameMode = tick.gameMode || lastStatus.gameMode;
    lastStatus.gameTime = tick.gameTime || 0;
  }

  if (tick.inGame) offGameStreak = 0;
  else if (session && !session.manual) offGameStreak += 1;

  if (!session && (tick.inGame || leagueOpen)) {
    if (!store.getSettings().autoRecord) {
      broadcast({ inGame: !!tick.inGame, gameTime: tick.gameTime || 0 });
      return;
    }
    if (Date.now() - lastStartAttempt < 1500) return;
    lastStartAttempt = Date.now();
    startSession(tick).catch((err) => broadcast({ error: err.message }));
    return;
  }
  if (!session) {
    broadcast({ inGame: !!tick.inGame, gameTime: tick.gameTime || 0 });
    return;
  }

  sendRecorder('recorder:focus', true);
  if (leagueFocused) session.seenFocused = true;
  noteFocus(leagueFocused && session.seenFocused);
  session.paused = false;
  if (session.warning && session.warning.startsWith('Paused')) {
    session.warning = 'Recording the game window.';
  }

  if (leagueOpen) {
    session.seenGame = true;
    windowGoneStreak = 0;
  } else if (session.seenGame || session.ready) {
    windowGoneStreak += 1;
  }

  if (tick.inGame) {
    session.you = tick.you || session.you;
    session.champion = tick.champion || session.champion;
    session.gameMode = tick.gameMode || session.gameMode;
    session.gameTime = tick.gameTime || session.gameTime;
    sendRecorder('recorder:gameTime', session.gameTime);
    for (const ev of tick.events || []) {
      if (session.seen.has(ev.id)) continue;
      session.seen.add(ev.id);
      noteTimeline(ev);
      queueClip(ev);
    }
    persistSession({
      you: session.you,
      champion: session.champion,
      gameMode: session.gameMode,
      duration: session.gameTime,
      clips: session.clips,
    });
  }

  if ((session.seenGame || session.ready) && windowGoneStreak >= 4) {
    stopSession().catch((err) => broadcast({ error: err.message }));
    return;
  }

  broadcast({
    recording: true,
    inGame: !!tick.inGame,
    you: session.you,
    champion: session.champion,
    gameTime: session.gameTime,
    source: session.sourceName,
    warning: session.warning,
    error: session.error,
  });
}

function startPolling() {
  if (!ENABLED) return;
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    let leagueOpen = false;
    let leagueFocused = false;
    try {
      const bounds = await getLeagueBounds();
      leagueOpen = !!(bounds?.running || bounds?.hasRect);
      leagueFocused = !!bounds?.focused;
      if (!leagueOpen) {
        try { leagueOpen = await leagueGameOpen(); } catch { /* ignore */ }
      }
    } catch {
      try { leagueOpen = await leagueGameOpen(); } catch { leagueOpen = false; }
    }
    try {
      const tick = await getRecorderTick();
      handleTick(tick, leagueOpen, leagueFocused);
    } catch {
      handleTick({ inGame: false }, leagueOpen, leagueFocused);
    }
  }, POLL_MS);
}

function fromRecorder(wc) {
  return recWin && !recWin.isDestroyed() && wc === recWin.webContents;
}

function register(ipcMain) {
  registerProtocol();
  startPolling();

  ipcMain.handle('recorder:listSources', async () => {
    const sources = await listCaptureSources(['screen', 'window']);
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
    }));
  });
  ipcMain.on('recorder:started', (e, info) => {
    if (!fromRecorder(e.sender) || !session) return;
    const mime = String(info?.mime || '');
    session.container = info?.container || (mime.includes('mp4') ? 'mp4' : 'webm');
    session.mime = mime;
    if (info?.file) session.matchFile = info.file;
    else if (!session.matchFile) session.matchFile = matchRel();
  });
  ipcMain.on('recorder:progress', (e, info) => {
    if (!fromRecorder(e.sender) || !session) return;
    session.bytes = (session.bytes || 0) + Number(info?.bytes || 0);
    if (info?.file) session.matchFile = info.file;
    persistSession({ bytes: session.bytes, matchFile: session.matchFile });
    if (!session.ready && session.bytes > 4000) {
      session.ready = true;
      resolveReady();
    }
  });
  ipcMain.on('recorder:chunk', (e, payload) => {
    if (!fromRecorder(e.sender)) return;
    onChunk(payload);
  });
  ipcMain.on('recorder:error', (e, msg) => {
    if (!fromRecorder(e.sender)) return;
    const text = String(msg || 'Recorder error');
    if (session) session.error = text;
    if (session && !session.ready) resolveReady(new Error(text));
    else broadcast({ error: text });
  });
  ipcMain.on('recorder:stopped', (e) => {
    if (!fromRecorder(e.sender)) return;
    const fn = stopWait;
    stopWait = null;
    if (fn) fn();
  });

  ipcMain.handle('replays:status', () => getStatus());
  ipcMain.handle('replays:getSettings', () => store.getSettings());
  ipcMain.handle('replays:setSettings', (_e, patch) => {
    const next = store.setSettings(patch || {});
    broadcast({});
    return next;
  });
  ipcMain.handle('replays:list', () => store.getIndex().matches);
  ipcMain.handle('replays:start', async () => {
    let tick = {
      inGame: lastStatus.inGame,
      you: lastStatus.you,
      champion: lastStatus.champion,
      gameTime: lastStatus.gameTime,
      gameMode: lastStatus.gameMode,
    };
    try {
      const live = await getRecorderTick();
      tick = { ...tick, ...live };
    } catch { /* ignore */ }
    return startSession(tick, { manual: true });
  });
  ipcMain.handle('replays:stop', () => stopSession());
  ipcMain.handle('replays:delete', (_e, id) => {
    if (session?.id === id) return { ok: false, error: 'Stop recording first' };
    store.removeMatch(id);
    return { ok: true };
  });
  ipcMain.handle('replays:deleteItems', (_e, items) => {
    const list = Array.isArray(items) ? items : [];
    const byMatch = new Map();
    for (const it of list) {
      const matchId = it?.matchId;
      if (!matchId) continue;
      if (session?.id === matchId) continue;
      if (it.full) {
        store.removeMatch(matchId);
        continue;
      }
      if (!byMatch.has(matchId)) byMatch.set(matchId, []);
      if (it.clipId) byMatch.get(matchId).push(it.clipId);
    }
    for (const [id, clipIds] of byMatch) {
      if (!store.getIndex().matches.some((m) => m.id === id)) continue;
      store.removeClips(id, clipIds);
    }
    return { ok: true };
  });
  ipcMain.handle('replays:openFolder', (_e, id) => {
    const dir = id ? store.matchDir(id) : store.rootDir();
    return shell.openPath(dir);
  });
  ipcMain.handle('replays:openFile', (_e, { id, rel }) => {
    const full = store.safeJoin(id, rel);
    return shell.openPath(full);
  });
  ipcMain.handle('replays:fileUrl', (_e, { id, rel }) => {
    store.safeJoin(id, rel);
    const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    return `gdreplay://local/${id}/${clean}`;
  });
  ipcMain.handle('replays:prepare', async (_e, { id, rel, duration }) => {
    const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const match = store.getIndex().matches.find((m) => m.id === id);
    let dur = Number(duration) || Number(match?.duration) || 0;
    const isClipFile = /^clips\//i.test(clean) || (/\.mp4$/i.test(clean) && clean !== 'seekable.mp4' && clean !== (match?.matchFile || ''));
    if (isClipFile) {
      try {
        const clipFull = store.safeJoin(id, clean);
        if (fs.existsSync(clipFull) && fs.statSync(clipFull).size > 10000) {
          const probed = await probeDurationSec(clipFull);
          return {
            url: `gdreplay://local/${id}/${clean}`,
            duration: probed > 0.5 ? probed : dur,
            segments: [],
            seekableUrl: `gdreplay://local/${id}/${clean}`,
          };
        }
      } catch { /* remux the match instead */ }
    }
    if (session?.id !== id) {
      try {
        await makeSeekableMp4(store.matchDir(id), {
          matchFile: match?.matchFile || clean,
          segments: match?.segments,
        });
      } catch { /* play original */ }
    }
    let urlRel = clean;
    try {
      const seekFull = store.safeJoin(id, 'seekable.mp4');
      if (fs.existsSync(seekFull) && fs.statSync(seekFull).size > 40000) {
        urlRel = 'seekable.mp4';
        const probed = await probeDurationSec(seekFull);
        if (probed > 1) {
          dur = probed;
          if (match?.id) store.upsertMatch({ id: match.id, duration: probed });
        }
      }
    } catch { /* ignore */ }
    return {
      url: `gdreplay://local/${id}/${urlRel}`,
      duration: dur,
      segments: [],
      seekableUrl: urlRel === 'seekable.mp4' ? `gdreplay://local/${id}/seekable.mp4` : null,
    };
  });
  ipcMain.handle('replays:saveTranscode', (_e, { id, bytes }) => {
    const buf = Buffer.from(bytes);
    if (buf.length < 10000) return null;
    const rel = 'seekable.mp4';
    fs.writeFileSync(path.join(store.matchDir(id), rel), buf);
    return { url: `gdreplay://local/${id}/${rel}`, rel };
  });
  ipcMain.handle('replays:slice', async (_e, { id, rel, start, duration }) => {
    const full = store.safeJoin(id, rel);
    const startSec = Math.max(0, Number(start) || 0);
    const sliced = await sliceWebmFile(full, startSec, Number(duration) || 0);
    if (!sliced?.path) return null;
    const dest = store.safeJoin(id, 'seek.webm');
    fs.copyFileSync(sliced.path, dest);
    try { fs.rmSync(sliced.path, { force: true }); } catch { /* ignore */ }
    return {
      url: `gdreplay://local/${id}/seek.webm?v=${Date.now()}`,
      start: Number(sliced.start) || startSec,
    };
  });
  ipcMain.handle('replays:diskInfo', () => diskInfo());
  ipcMain.handle('replays:saveMoment', () => saveMomentNow('Manual'));
  ipcMain.handle('replays:exportExcerpt', async (_e, { id, rel, start, duration, suggestName }) => {
    const full = store.safeJoin(id, rel);
    if (!fs.existsSync(full)) return { ok: false, error: 'File missing' };
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win || undefined, {
      title: 'Export excerpt',
      defaultPath: suggestName || `rift-excerpt-${Date.now()}.mp4`,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await cutClip(full, result.filePath, start, duration);
    let bytes = 0;
    try { bytes = fs.statSync(result.filePath).size; } catch { /* ignore */ }
    return { ok: true, path: result.filePath, bytes };
  });

  app.on('before-quit', (e) => {
    if (quitting || !session) return;
    e.preventDefault();
    quitting = true;
    stopSession().finally(() => {
      if (recWin && !recWin.isDestroyed()) {
        try { recWin.destroy(); } catch { /* ignore */ }
      }
      recWin = null;
      app.quit();
    });
  });
}

async function destroy() {
  try { await stopSession(); } catch { /* ignore */ }
  if (recWin && !recWin.isDestroyed()) {
    try { recWin.destroy(); } catch { /* ignore */ }
  }
  recWin = null;
}

module.exports = { ENABLED, prepare, register, stopSession, destroy };
