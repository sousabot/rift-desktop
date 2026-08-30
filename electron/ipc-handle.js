/** Register ipcMain.handle, replacing any existing listener for the channel. */

function handle(ipcMain, channel, listener) {
  try { ipcMain.removeHandler(channel); } catch { /* first register */ }
  ipcMain.handle(channel, listener);
}

function stubHandle(ipcMain, channel, listener) {
  try {
    handle(ipcMain, channel, listener);
  } catch (err) {
    console.error(`[ipc] ${channel} stub failed:`, err);
  }
}

function safeRegister(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[ipc] ${name} failed to register:`, err);
  }
}

module.exports = { handle, stubHandle, safeRegister };
