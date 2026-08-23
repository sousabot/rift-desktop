const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const registerStatsHandlers = require('./stats-store');
const registerFeedbackHandlers = require('./feedback-ipc');
const overlay = require('./overlay');
const recorder = require('./recorder');
const { getLiveSnapshot, getLiveRoster } = require('./live-client');
const { getVideoMode, ensureBorderless, enableFullscreenOptimizations } = require('./league-config');
const overlayPanels = require('./overlay-panels');

function broadcastPanelToggles(toggles) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try { win.webContents.send('overlay:panelToggles', toggles); } catch { /* ignore */ }
  }
}

app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
app.setAppUserModelId('com.riftlol.desktop');
recorder.prepare();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;
let tray = null;
let quitting = false;

function iconPath() {
  return path.join(__dirname, 'icon.png');
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  createTray();
  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
}

function quitApp() {
  quitting = true;
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
  app.quit();
}

function createTray() {
  if (tray) return;
  let image = nativeImage.createFromPath(iconPath());
  if (image.isEmpty()) image = nativeImage.createEmpty();
  else image = image.resize({ width: 32, height: 32 });
  tray = new Tray(image);
  tray.setToolTip('Rift.lol');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Rift.lol', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Close', click: () => quitApp() },
  ]));
  tray.on('click', () => showMainWindow());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1280,
    minHeight: 780,
    backgroundColor: '#0b0e16',
    icon: path.join(__dirname, 'icon.png'),
    frame: false,
    transparent: false,
    roundedCorners: true,
    hasShadow: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.center();
  mainWindow.on('maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
  });
  mainWindow.on('enter-full-screen', () => mainWindow.setFullScreen(false));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    hideToTray();
  });
  mainWindow.on('closed', () => {
    overlay.closeOverlayWindow();
    recorder.destroy();
    mainWindow = null;
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
});
ipcMain.on('window:close', () => hideToTray());
ipcMain.handle('window:isMaximized', () => false);

ipcMain.handle('live:snapshot', () => getLiveSnapshot());
ipcMain.handle('live:roster', () => getLiveRoster());
ipcMain.handle('overlay:open', async () => {
  if (!overlay.isEnabled()) return { open: false, disabled: true };
  overlay.createOverlayWindow(app, { engine: 'desktop' });
  setImmediate(() => {
    Promise.all([
      enableFullscreenOptimizations().catch((err) => ({ ok: false, reason: err.message })),
      ensureBorderless().catch((err) => ({ ok: false, reason: err.message })),
    ]).then(([fso, borderless]) => {
      const video = {
        ...borderless,
        fso,
        applyNow: !!borderless?.applyNow,
        restartGame: !!fso?.restartGame,
        engine: 'desktop',
      };
      overlay.pushVideo(video);
    });
  });
  return { open: true, video: { engine: 'desktop' } };
});
ipcMain.handle('overlay:close', () => {
  overlay.closeOverlayWindow();
  return { open: false };
});
ipcMain.handle('overlay:isOpen', () => overlay.isOverlayOpen());
ipcMain.handle('overlay:getClickThrough', () => overlay.getClickThrough());
ipcMain.handle('overlay:setClickThrough', (_e, value) => overlay.setClickThrough(value));
ipcMain.handle('overlay:attached', () => overlay.isAttached());
ipcMain.handle('overlay:videoHint', () => overlay.getLastVideo());
ipcMain.handle('overlay:status', () => overlay.getStatus());
ipcMain.handle('overlay:videoMode', () => getVideoMode());
ipcMain.handle('overlay:useBorderless', () => ensureBorderless());
ipcMain.on('overlay:ignoreMouse', (_e, ignore) => overlay.setIgnoreMouse(ignore));
ipcMain.handle('overlay:getEditMode', () => overlay.isEditing());
ipcMain.handle('overlay:toggleEdit', () => overlay.toggleEditMode());
ipcMain.on('overlay:startDrag', (e) => overlay.startDrag(e.sender));
ipcMain.handle('overlay:getLayout', () => overlay.getLayout());
ipcMain.handle('overlay:setPanelPos', (_e, id, point) => overlay.setPanelPos(id, point));
ipcMain.handle('overlay:getPanelToggles', () => overlayPanels.load());
ipcMain.handle('overlay:setPanelToggle', (_e, id, enabled) => {
  const next = overlayPanels.setPanel(id, enabled);
  broadcastPanelToggles(next);
  return next;
});

app.on('second-instance', () => showMainWindow());

app.whenReady().then(() => {
  if (!gotLock) return;
  overlay.init(app);
  const riotIpc = require('./riot-ipc');
  riotIpc(ipcMain);
  require('./lcu').register(ipcMain);
  require('./probuilds').register(ipcMain);
  require('./spectate').register(ipcMain, { riotFetch: riotIpc.riotFetch });
  registerStatsHandlers(ipcMain);
  registerFeedbackHandlers(ipcMain);
  try {
    require('./premium-ipc')(ipcMain);
  } catch (err) {
    console.error('[premium] failed to register IPC handlers:', err);
  }
  require('./season-peak')(ipcMain);
  require('./ugg-lp')(ipcMain);
  require('./meta-builds')(ipcMain);
  require('./champion-detail')(ipcMain);
  require('./pros')(ipcMain);
  recorder.register(ipcMain);
  require('./updater').register({
    getWindow: () => mainWindow,
    prepareQuit: () => { quitting = true; },
  });
  createTray();
  createWindow();

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  overlay.unregisterHotkeys();
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
});

app.on('window-all-closed', () => {
  // Stay in the tray. Real exit is tray → Close.
});