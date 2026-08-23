const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('riotAPI', {
  wakeProxy: () => ipcRenderer.invoke('riot:wakeProxy'),
  linkAccount: (args) => ipcRenderer.invoke('riot:linkAccount', args),
  getLeagueShard: (args) => ipcRenderer.invoke('riot:getLeagueShard', args),
  getAccountByRiotId: (args) => ipcRenderer.invoke('riot:getAccountByRiotId', args),
  getSummonerByPuuid: (args) => ipcRenderer.invoke('riot:getSummonerByPuuid', args),
  getRankedEntries:  (args) => ipcRenderer.invoke('riot:getRankedEntries', args),
  getRankedByPuuid:  (args) => ipcRenderer.invoke('riot:getRankedByPuuid', args),
  getRankedByPuuidsBulk: (args) => ipcRenderer.invoke('riot:getRankedByPuuidsBulk', args),
  getMatchIds: (args) => ipcRenderer.invoke('riot:getMatchIds', args),
  getMatchesBulk: (args) => ipcRenderer.invoke('riot:getMatchesBulk', args),
  getTimelinesBulk: (args) => ipcRenderer.invoke('riot:getTimelinesBulk', args),
  getActiveGame: (args) => ipcRenderer.invoke('riot:getActiveGame', args),
  getTopLeague: (args) => ipcRenderer.invoke('riot:getTopLeague', args),
  getAccountsByPuuidsBulk: (args) => ipcRenderer.invoke('riot:getAccountsByPuuidsBulk', args),
  getSummonersByPuuidsBulk: (args) => ipcRenderer.invoke('riot:getSummonersByPuuidsBulk', args),
  getChampionMasteryBulk: (args) => ipcRenderer.invoke('riot:getChampionMasteryBulk', args),
  getChampionMasteries: (args) => ipcRenderer.invoke('riot:getChampionMasteries', args),
  getSeasonPeak: (args) => ipcRenderer.invoke('peak:seasonHigh', args),
  getUggMatchLp: (args) => ipcRenderer.invoke('ugg:matchLp', args),
  getLastMatchIdsBulk: (args) => ipcRenderer.invoke('riot:getLastMatchIdsBulk', args),
  getTierList: (args) => ipcRenderer.invoke('riot:getTierList', args),
  getLensBenchmarks: (args) => ipcRenderer.invoke('lens:getBenchmarks', args),
  onLensBenchmarksReady: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('lens:benchmarksReady', handler);
    return () => ipcRenderer.removeListener('lens:benchmarksReady', handler);
  },
  getStudioMeta: (args) => ipcRenderer.invoke('studio:getMeta', args),
  onStudioMetaReady: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('studio:metaReady', handler);
    return () => ipcRenderer.removeListener('studio:metaReady', handler);
  },
  onTierListProgress: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('tierlist:progress', handler);
    return () => ipcRenderer.removeListener('tierlist:progress', handler);
  },
  onTierListReady: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('tierlist:ready', handler);
    return () => ipcRenderer.removeListener('tierlist:ready', handler);
  },
  getStatSnapshot:  (args) => ipcRenderer.invoke('stats:getSnapshot', args),
  saveStatSnapshot: (args) => ipcRenderer.invoke('stats:saveSnapshot', args),
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
});

contextBridge.exposeInMainWorld('riftAPI', {
  sendFeedback: (payload) => ipcRenderer.invoke('app:sendFeedback', payload),
  appInfo: () => ipcRenderer.invoke('app:info'),
  premiumStatus: () => ipcRenderer.invoke('premium:status'),
  premiumCheckout: (args) => ipcRenderer.invoke('premium:checkout', args),
  premiumRedeem: (args) => ipcRenderer.invoke('premium:redeem', args),
  premiumRedeemGift: (args) => ipcRenderer.invoke('premium:redeemGift', args),
  premiumOpen: (url) => ipcRenderer.invoke('premium:open', url),
});

contextBridge.exposeInMainWorld('riftUpdate', {
  info: () => ipcRenderer.invoke('app:info'),
  status: () => ipcRenderer.invoke('update:status'),
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  open: (url) => ipcRenderer.invoke('update:open', url),
  onStatus: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
});

contextBridge.exposeInMainWorld('lcuAPI', {
  getStatus: () => ipcRenderer.invoke('lcu:status'),
  getCollections: (force) => ipcRenderer.invoke('lcu:collections', force),
  getChampSelect: () => ipcRenderer.invoke('lcu:champSelect'),
  applyRunes: (page) => ipcRenderer.invoke('lcu:applyRunes', page),
  selectChamp: (payload) => ipcRenderer.invoke('lcu:selectChamp', payload),
  getRankedInsight: () => ipcRenderer.invoke('lcu:rankedInsight'),
});

contextBridge.exposeInMainWorld('probuildsAPI', {
  list: (args) => ipcRenderer.invoke('probuilds:list', args),
});

contextBridge.exposeInMainWorld('metaBuildsAPI', {
  get: (args) => ipcRenderer.invoke('meta:builds', args),
  detail: (args) => ipcRenderer.invoke('meta:championDetail', args),
});

contextBridge.exposeInMainWorld('prosAPI', {
  list: (args) => ipcRenderer.invoke('pros:list', args),
  get: (name) => ipcRenderer.invoke('pros:player', name),
  lookup: (riotId) => ipcRenderer.invoke('pros:lookup', riotId),
});

contextBridge.exposeInMainWorld('spectateAPI', {
  list: (args) => ipcRenderer.invoke('spectate:list', args),
  launch: (args) => ipcRenderer.invoke('spectate:launch', args),
});

contextBridge.exposeInMainWorld('replaysAPI', {
  getStatus: () => ipcRenderer.invoke('replays:status'),
  getSettings: () => ipcRenderer.invoke('replays:getSettings'),
  setSettings: (patch) => ipcRenderer.invoke('replays:setSettings', patch),
  list: () => ipcRenderer.invoke('replays:list'),
  start: () => ipcRenderer.invoke('replays:start'),
  stop: () => ipcRenderer.invoke('replays:stop'),
  deleteMatch: (id) => ipcRenderer.invoke('replays:delete', id),
  deleteItems: (items) => ipcRenderer.invoke('replays:deleteItems', items),
  openFolder: (id) => ipcRenderer.invoke('replays:openFolder', id),
  openFile: (id, rel) => ipcRenderer.invoke('replays:openFile', { id, rel }),
  fileUrl: (id, rel) => ipcRenderer.invoke('replays:fileUrl', { id, rel }),
  prepare: (args) => ipcRenderer.invoke('replays:prepare', args),
  saveTranscode: (args) => ipcRenderer.invoke('replays:saveTranscode', args),
  slice: (args) => ipcRenderer.invoke('replays:slice', args),
  onStatus: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('replays:status', handler);
    return () => ipcRenderer.removeListener('replays:status', handler);
  },
});

contextBridge.exposeInMainWorld('liveClient', {
  getSnapshot: () => ipcRenderer.invoke('live:snapshot'),
  getRoster: () => ipcRenderer.invoke('live:roster'),
  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  isOverlayOpen: () => ipcRenderer.invoke('overlay:isOpen'),
  getClickThrough: () => ipcRenderer.invoke('overlay:getClickThrough'),
  setClickThrough: (value) => ipcRenderer.invoke('overlay:setClickThrough', value),
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:ignoreMouse', ignore),
  isAttached: () => ipcRenderer.invoke('overlay:attached'),
  getVideoMode: () => ipcRenderer.invoke('overlay:videoMode'),
  useBorderless: () => ipcRenderer.invoke('overlay:useBorderless'),
  getVideoHint: () => ipcRenderer.invoke('overlay:videoHint'),
  getStatus: () => ipcRenderer.invoke('overlay:status'),
  onStatus: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:status', handler);
    return () => ipcRenderer.removeListener('overlay:status', handler);
  },
  onVideoHint: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:video', handler);
    return () => ipcRenderer.removeListener('overlay:video', handler);
  },
  onAttached: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:attached', handler);
    return () => ipcRenderer.removeListener('overlay:attached', handler);
  },
  isEditMode: () => ipcRenderer.invoke('overlay:getEditMode'),
  toggleEditMode: () => ipcRenderer.invoke('overlay:toggleEdit'),
  startDrag: () => ipcRenderer.send('overlay:startDrag'),
  getLayout: () => ipcRenderer.invoke('overlay:getLayout'),
  setPanelPos: (id, point) => ipcRenderer.invoke('overlay:setPanelPos', id, point),
  onLayout: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:layout', handler);
    return () => ipcRenderer.removeListener('overlay:layout', handler);
  },
  onEditMode: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:editMode', handler);
    return () => ipcRenderer.removeListener('overlay:editMode', handler);
  },
  onScoutToggle: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('overlay:scoutToggle', handler);
    return () => ipcRenderer.removeListener('overlay:scoutToggle', handler);
  },
  getPanelToggles: () => ipcRenderer.invoke('overlay:getPanelToggles'),
  setPanelToggle: (id, enabled) => ipcRenderer.invoke('overlay:setPanelToggle', id, enabled),
  onPanelToggles: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('overlay:panelToggles', handler);
    return () => ipcRenderer.removeListener('overlay:panelToggles', handler);
  },
});