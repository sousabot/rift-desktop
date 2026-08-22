const { BrowserWindow, globalShortcut } = require('electron');
const desktop = require('./desktop-overlay');
const { loadPos } = require('./overlay-pos');
const editHotkey = require('./edit-hotkey');

const EDIT_ACCEL = 'CommandOrControl+B';
const SCOUT_ACCEL = 'CommandOrControl+Shift+S';
const ENABLED = true;

let electronApp = null;
let lastVideo = null;
let clickThrough = true;
let editing = false;
let lastToggleAt = 0;

function emitEdit() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try { win.webContents.send('overlay:editMode', editing); } catch { /* ignore */ }
  }
}

function applyInputMode() {
  desktop.setClickThrough(clickThrough && !editing);
}

function emitScoutToggle() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try { win.webContents.send('overlay:scoutToggle'); } catch { /* ignore */ }
  }
}

function syncDesktopHotkey() {
  for (const accel of [EDIT_ACCEL, SCOUT_ACCEL]) {
    try { globalShortcut.unregister(accel); } catch { /* ignore */ }
  }
  if (!isOverlayOpen()) return;
  try {
    globalShortcut.register(EDIT_ACCEL, () => {
      if (isOverlayOpen()) toggleEditMode();
    });
    globalShortcut.register(SCOUT_ACCEL, () => {
      if (isOverlayOpen()) emitScoutToggle();
    });
  } catch (err) {
    console.warn('[overlay] overlay hotkeys failed', err?.message || err);
  }
}

function startEditHotkeys() {
  editHotkey.start(
    () => {
      if (isOverlayOpen()) toggleEditMode();
    },
    () => {
      if (isOverlayOpen()) emitScoutToggle();
    },
  );
  syncDesktopHotkey();
}

function toggleEditMode(force) {
  if (!isOverlayOpen() && force !== false) return editing;
  const now = Date.now();
  if (typeof force !== 'boolean' && now - lastToggleAt < 320) return editing;

  const next = typeof force === 'boolean' ? force : !editing;
  // Only unlock HUD while League is actually attached — not with client closed.
  if (next && !desktop.isAttached()) {
    if (editing) {
      editing = false;
      desktop.setEditing(false);
      applyInputMode();
      emitEdit();
    }
    return editing;
  }

  if (typeof force !== 'boolean') lastToggleAt = now;
  editing = next;
  desktop.setEditing(editing);
  applyInputMode();
  emitEdit();
  return editing;
}

function init(app) {
  electronApp = app;
  if (!ENABLED) return;
  desktop.setPanels(loadPos());
  desktop.setAttachListener((attached) => {
    if (!attached && editing) toggleEditMode(false);
  });
  desktop.setWindowReadyListener(() => {
    startEditHotkeys();
    syncDesktopHotkey();
  });
}

function createOverlayWindow(app, video) {
  if (!ENABLED) return { open: false, disabled: true };
  electronApp = app;
  if (video) lastVideo = video;
  desktop.createOverlayWindow(app, video);
  syncDesktopHotkey();
  return { wanted: true };
}

function pushVideo(video) {
  if (video) lastVideo = video;
  desktop.sendVideo(video);
}

function closeOverlayWindow() {
  if (editing) toggleEditMode(false);
  desktop.closeOverlayWindow();
  editHotkey.stop();
  syncDesktopHotkey();
}

function isOverlayOpen() {
  if (!ENABLED) return false;
  return desktop.isOverlayOpen();
}

function setClickThrough(next) {
  clickThrough = !!next;
  applyInputMode();
  return clickThrough;
}

function getClickThrough() {
  return clickThrough;
}

function setIgnoreMouse(ignore) {
  if (editing) return;
  if (ignore) desktop.setIgnoreMouse(true);
}

function startDrag() {
  // Panels drag inside the renderer while unlocked.
}

function getLayout() {
  return desktop.getPanels();
}

function setPanelPos(id, point) {
  return desktop.setPanel(id, point);
}

function isAttached() {
  return desktop.isAttached();
}

function getLastVideo() {
  return lastVideo;
}

function getStatus() {
  if (!ENABLED) {
    return { engine: 'off', ready: false, wanted: false, attached: false, phase: 'disabled' };
  }
  const wanted = desktop.isOverlayOpen();
  const attached = desktop.isAttached();
  const surface = desktop.hasOverlaySurface?.() || false;
  return {
    engine: 'desktop',
    ready: true,
    wanted,
    attached,
    injected: false,
    phase: !wanted ? 'idle' : (attached && surface ? 'attached' : 'waiting'),
    video: lastVideo || null,
  };
}

function isEditing() {
  return editing;
}

function unregisterHotkeys() {
  editHotkey.stop();
  for (const accel of [EDIT_ACCEL, SCOUT_ACCEL]) {
    try { globalShortcut.unregister(accel); } catch { /* ignore */ }
  }
}

module.exports = {
  ENABLED,
  isEnabled: () => ENABLED,
  init,
  createOverlayWindow,
  closeOverlayWindow,
  pushVideo,
  isOverlayOpen,
  setClickThrough,
  getClickThrough,
  setIgnoreMouse,
  startDrag,
  getLayout,
  setPanelPos,
  toggleEditMode,
  isEditing,
  isAttached,
  getLastVideo,
  getStatus,
  unregisterHotkeys,
};
