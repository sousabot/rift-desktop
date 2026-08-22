const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { getLeagueBounds, startLeagueWatcher, stopLeagueWatcher } = require('./league-window');
const { loadPos, savePos, savePanel } = require('./overlay-pos');

let overlayWindow = null;
let clickThrough = true;
let editing = false;
let panels = null;
let lastTarget = null;
let followTimer = null;
let lastPos = '';
let attached = false;
let lastVideo = null;
let unfocusedSince = 0;
/** User enabled overlay in settings — window is created lazily when League is running. */
let overlayWanted = false;
let electronAppRef = null;
/** Last known League window rect (DIP). */
let lastLeagueDip = null;
let onTopApplied = false;
let onAttachChange = null;
let onWindowReady = null;

const HIDE_AFTER_MS = 700;

function setAttachListener(fn) {
  onAttachChange = typeof fn === 'function' ? fn : null;
}

function setWindowReadyListener(fn) {
  onWindowReady = typeof fn === 'function' ? fn : null;
}

function setAttachedState(next) {
  const v = !!next;
  if (attached === v) return;
  attached = v;
  try { onAttachChange?.(attached); } catch { /* ignore */ }
}

function sendVideo(video) {
  if (video) lastVideo = video;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { overlayWindow.webContents.send('overlay:video', lastVideo); } catch { /* ignore */ }
}

function sendLayout({ includePanels = true } = {}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const b = overlayWindow.getBounds();
  const payload = {
    width: b.width,
    height: b.height,
    editing,
  };
  if (includePanels) payload.panels = getPanels();
  try {
    overlayWindow.webContents.send('overlay:layout', payload);
  } catch { /* ignore */ }
}

function overlayUrl(app) {
  if (app.isPackaged) {
    return { file: path.join(__dirname, '..', 'dist', 'index.html'), hash: '/overlay' };
  }
  return { url: 'http://localhost:5173/#/overlay' };
}

function applyClickThrough() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (editing || !clickThrough) {
    overlayWindow.setIgnoreMouseEvents(false);
    return;
  }
  overlayWindow.setIgnoreMouseEvents(true);
}

function resetInputState() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  applyFocusable();
  applyClickThrough();
}

function applyFocusable() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try { overlayWindow.setFocusable(!!editing); } catch { /* ignore */ }
}

function getPanels() {
  if (!panels) panels = loadPos();
  return {
    bench: { ...panels.bench },
    items: { ...panels.items },
    obj: { ...panels.obj },
    trinket: { ...panels.trinket },
    skill: { ...panels.skill },
    winprob: { ...panels.winprob },
    scout: { ...panels.scout },
  };
}

function clampPanelsToSize(width, height) {
  const cur = getPanels();
  const clamp = (p) => ({
    x: Math.round(Math.min(Math.max(Number(p.x) || 0, -20), Math.max(40, width - 40))),
    y: Math.round(Math.min(Math.max(Number(p.y) || 0, -20), Math.max(40, height - 40))),
  });
  const next = {
    bench: clamp(cur.bench),
    items: clamp(cur.items),
    obj: clamp(cur.obj),
    trinket: clamp(cur.trinket),
    skill: clamp(cur.skill),
    winprob: clamp(cur.winprob),
    scout: clamp(cur.scout),
  };
  if (
    next.bench.x === cur.bench.x && next.bench.y === cur.bench.y
    && next.items.x === cur.items.x && next.items.y === cur.items.y
    && next.obj.x === cur.obj.x && next.obj.y === cur.obj.y
    && next.trinket.x === cur.trinket.x && next.trinket.y === cur.trinket.y
    && next.skill.x === cur.skill.x && next.skill.y === cur.skill.y
    && next.winprob.x === cur.winprob.x && next.winprob.y === cur.winprob.y
    && next.scout.x === cur.scout.x && next.scout.y === cur.scout.y
  ) {
    return cur;
  }
  panels = savePos(next);
  return getPanels();
}

function setPanels(next) {
  panels = savePos(next || getPanels());
  sendLayout();
  return getPanels();
}

function setPanel(id, point) {
  panels = savePanel(id, point);
  sendLayout();
  return getPanels();
}

function setEditing(on) {
  editing = !!on;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  applyFocusable();
  applyClickThrough();
  try { overlayWindow.setMovable(false); } catch { /* ignore */ }
  if (editing) {
    try { overlayWindow.focus(); } catch { /* ignore */ }
  }
  sendLayout();
}

function toDipRect(bounds) {
  const x = Number(bounds?.x) || 0;
  const y = Number(bounds?.y) || 0;
  const width = Math.max(320, Number(bounds?.width) || 1280);
  const height = Math.max(240, Number(bounds?.height) || 720);
  const right = x + width;
  const bottom = y + height;
  if (typeof screen.screenToDipPoint === 'function') {
    const tl = screen.screenToDipPoint({ x, y });
    const br = screen.screenToDipPoint({ x: right, y: bottom });
    return {
      x: Math.round(tl.x),
      y: Math.round(tl.y),
      width: Math.max(320, Math.round(br.x - tl.x)),
      height: Math.max(240, Math.round(br.y - tl.y)),
    };
  }
  const d = screen.getDisplayNearestPoint({ x, y });
  const s = d.scaleFactor || 1;
  return {
    x: Math.round(x / s),
    y: Math.round(y / s),
    width: Math.round(width / s),
    height: Math.round(height / s),
  };
}

function leagueDipRect(bounds) {
  if (bounds?.hasRect && Number(bounds.width) >= 200 && Number(bounds.height) >= 200) {
    return toDipRect(bounds);
  }
  return null;
}

function destroyOverlaySurface() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = null;
    return;
  }
  try { overlayWindow.setIgnoreMouseEvents(true); } catch { /* ignore */ }
  try { overlayWindow.destroy(); } catch {
    try { overlayWindow.close(); } catch { /* ignore */ }
  }
  overlayWindow = null;
  editing = false;
  onTopApplied = false;
}

/** Tear down the GPU layer while keeping overlay armed — cursor goes back to normal. */
function hideOverlay() {
  setAttachedState(false);
  lastPos = '';
  onTopApplied = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try { overlayWindow.webContents.send('overlay:attached', false); } catch { /* ignore */ }
  }
  destroyOverlaySurface();
}

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  if (!electronAppRef) return null;

  overlayWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: -12000,
    y: -12000,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    focusable: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });

  overlayWindow.setMenuBarVisibility(false);
  try {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch { /* ignore */ }

  const target = overlayUrl(electronAppRef);
  if (target.file) overlayWindow.loadFile(target.file, { hash: target.hash });
  else overlayWindow.loadURL(target.url);

  overlayWindow.once('ready-to-show', () => {
    applyFocusable();
    applyClickThrough();
    sendVideo(lastVideo);
    sendLayout();
    try { onWindowReady?.(); } catch { /* ignore */ }
  });
  overlayWindow.webContents.on('did-finish-load', () => {
    try { overlayWindow.webContents.setFrameRate(20); } catch { /* ignore */ }
    sendLayout();
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    editing = false;
    onTopApplied = false;
  });

  return overlayWindow;
}

function pinToLeague(bounds) {
  if (!overlayWanted) return;

  const leagueFocused = !!bounds?.focused;
  const gameRunning = !!bounds?.running;
  const hasGame = !!(bounds?.hasRect && gameRunning);
  const keepForEdit = editing && gameRunning;

  if (hasGame) {
    const gameDip = leagueDipRect(bounds);
    if (gameDip) lastLeagueDip = gameDip;
  }

  if (!leagueFocused && !keepForEdit) {
    if (!unfocusedSince) unfocusedSince = Date.now();
    if (Date.now() - unfocusedSince < HIDE_AFTER_MS) {
      if (!gameRunning) return;
    } else {
      hideOverlay();
      return;
    }
  } else {
    unfocusedSince = 0;
  }

  if (!gameRunning && !keepForEdit) {
    hideOverlay();
    return;
  }

  const dip = (hasGame && leagueDipRect(bounds)) || lastLeagueDip;
  if (!dip) return;

  // Only spin up Chromium once a live League window exists — not on "Show overlay" click.
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    if (!hasGame) return;
    ensureOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
  }

  lastTarget = hasGame ? bounds : lastTarget;
  setAttachedState(hasGame);
  try { overlayWindow.webContents.send('overlay:attached', attached); } catch { /* ignore */ }

  if (!overlayWindow.isVisible()) {
    applyClickThrough();
    overlayWindow.showInactive();
    if (!onTopApplied) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      onTopApplied = true;
    }
  }

  const next = {
    x: Math.round(dip.x),
    y: Math.round(dip.y),
    width: Math.round(dip.width),
    height: Math.round(dip.height),
  };
  const key = `${next.x},${next.y},${next.width},${next.height}`;
  if (key !== lastPos) {
    lastPos = key;
    overlayWindow.setBounds(next, false);
    clampPanelsToSize(next.width, next.height);
    sendLayout({ includePanels: true });
  }
}

function startFollow() {
  if (followTimer) return;
  startLeagueWatcher();
  const tick = async () => {
    const bounds = await getLeagueBounds();
    pinToLeague(bounds);
  };
  tick();
  followTimer = setInterval(tick, 1200);
}

function stopFollow() {
  if (followTimer) clearInterval(followTimer);
  followTimer = null;
  lastPos = '';
  setAttachedState(false);
  lastLeagueDip = null;
  onTopApplied = false;
}

function createOverlayWindow(app, video) {
  if (video) lastVideo = video;
  electronAppRef = app;
  overlayWanted = true;
  panels = loadPos();
  startFollow();
  return { wanted: true };
}

function closeOverlayWindow() {
  overlayWanted = false;
  stopFollow();
  stopLeagueWatcher();
  destroyOverlaySurface();
  editing = false;
}

function isOverlayOpen() {
  return overlayWanted;
}

function hasOverlaySurface() {
  return !!(overlayWindow && !overlayWindow.isDestroyed());
}

function setClickThrough(next) {
  clickThrough = !!next;
  applyClickThrough();
  return clickThrough;
}

function getClickThrough() {
  return clickThrough;
}

function setIgnoreMouse(ignore) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (editing) return;
  if (ignore) resetInputState();
}

module.exports = {
  createOverlayWindow,
  closeOverlayWindow,
  isOverlayOpen,
  hasOverlaySurface,
  setClickThrough,
  getClickThrough,
  setIgnoreMouse,
  setEditing,
  getPanels,
  setPanels,
  setPanel,
  isAttached: () => attached,
  setAttachListener,
  setWindowReadyListener,
  getLastVideo: () => lastVideo,
  sendVideo,
};
