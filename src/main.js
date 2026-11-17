'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  app, BrowserWindow, Menu, Notification, dialog, nativeTheme, screen, session, shell, clipboard,
} = require('electron');
const { resolveConfig } = require('./config');

const APP_ID = 'uz.faith.desktop';
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const OFFLINE_PAGE = path.join(__dirname, 'offline.html');
const SPLASH_PAGE = path.join(__dirname, 'splash.html');
const SHOW_DEADLINE_MS = 25_000; // a cold server start can take a while; never leave the user staring at the splash longer
const SPLASH_MIN_MS = 700;

app.setName('FAITH');
app.setAppUserModelId(APP_ID);

// Only one FAITH window set per computer; a second launch focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// A plain Chrome user agent: sign-in providers refuse agents that announce an embedded browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/i, '')
  .replace(/\sfaith-desktop\/\S+/i, '')
  .replace(/\sFAITH\/\S+/i, '');

const config = resolveConfig(process.argv, process.env, app.getPath('userData'));
let mainWindow = null;
let splashWindow = null;

/* ---------------------------------------------------------------- URL rules */

function hostAllowedInApp(host) {
  return config.inAppHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/** May this address load inside a FAITH window? */
function isInApp(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:') return path.normalize(decodeURIComponent(u.pathname).replace(/^\/(\w:)/, '$1')) === path.normalize(OFFLINE_PAGE);
    if (u.origin === config.origin) return true;
    return u.protocol === 'https:' && hostAllowedInApp(u.hostname);
  } catch {
    return false;
  }
}

function isSameApp(rawUrl) {
  try { return new URL(rawUrl).origin === config.origin; } catch { return false; }
}

function openExternal(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (['https:', 'http:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(u.toString());
  } catch { /* ignore malformed links */ }
}

/* ------------------------------------------------------------ window state */

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const fallback = { width: 1360, height: 860, maximized: false };
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (![s.width, s.height].every(Number.isFinite)) return fallback;
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
      // Drop the saved position if that monitor is gone.
      const area = screen.getDisplayMatching({ x: s.x, y: s.y, width: s.width, height: s.height }).workArea;
      const visible = s.x < area.x + area.width - 80 && s.x + s.width > area.x + 80 && s.y >= area.y - 10 && s.y < area.y + area.height - 80;
      if (!visible) { delete s.x; delete s.y; }
    }
    return { ...fallback, ...s };
  } catch {
    return fallback;
  }
}

function saveWindowState(win) {
  try {
    if (win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized() || win.isFullScreen();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized }));
  } catch { /* the next run uses defaults */ }
}

/* ------------------------------------------------------------------ windows */

const webPreferences = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webviewTag: false,
  spellcheck: false,
  backgroundThrottling: true,
  // Developer tools could pull lesson video addresses out of the page; only development runs get them.
  devTools: !app.isPackaged,
};

// Screen protection: every FAITH window is excluded from screenshots, screen recording and screen sharing
// (Windows shows it as an empty area to OBS, Game Bar, Snipping Tool, Zoom, Telegram and the like).
app.on('browser-window-created', (_event, win) => win.setContentProtection(true));

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 380,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    center: true,
    backgroundColor: '#000000',
    icon: ICON,
    title: 'FAITH',
    webPreferences,
  });
  splashWindow.once('ready-to-show', () => splashWindow && splashWindow.show());
  splashWindow.on('closed', () => { splashWindow = null; });
  splashWindow.loadFile(SPLASH_PAGE);
}

function createMainWindow() {
  const state = loadWindowState();
  const startedAt = Date.now();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'FAITH',
    icon: ICON,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences,
  });

  let shown = false;
  const reveal = () => {
    if (shown || !mainWindow) return;
    shown = true;
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - startedAt));
    setTimeout(() => {
      if (!mainWindow) return;
      if (state.maximized) mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
      if (splashWindow) splashWindow.close();
    }, wait);
  };

  const wc = mainWindow.webContents;
  wc.once('did-finish-load', reveal);
  wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
    // -3 is an aborted load (a newer navigation replaced it), not a failure.
    if (!isMainFrame || code === -3) return;
    showOffline(validatedURL, `${description} (${code})`);
    reveal();
  });
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') showOffline(wc.getURL(), `renderer: ${details.reason}`);
  });
  setTimeout(reveal, SHOW_DEADLINE_MS);

  // Mouse back/forward buttons.
  mainWindow.on('app-command', (_e, cmd) => {
    const h = wc.navigationHistory;
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack();
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward();
  });

  let saveTimer = null;
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 400); };
  mainWindow.on('resize', queueSave);
  mainWindow.on('move', queueSave);
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(config.url);
}

function showOffline(failedUrl, reason) {
  if (!mainWindow) return;
  const target = isSameApp(failedUrl) ? failedUrl : config.url;
  mainWindow.loadFile(OFFLINE_PAGE, { query: { url: target, reason: reason || '' } });
}

/* ----------------------------------------------- rules for every web page */

app.on('web-contents-created', (_e, contents) => {
  const guard = (event, url, isMainFrame) => {
    if (isMainFrame === false) return; // frames inside a page follow the page's own CSP
    if (isInApp(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', (event) => guard(event, event.url, event.isMainFrame));
  contents.on('will-redirect', (event) => guard(event, event.url, event.isMainFrame));
  contents.on('will-attach-webview', (event) => event.preventDefault());

  contents.setWindowOpenHandler(({ url }) => {
    if (isSameApp(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100, height: 760, minWidth: 380, minHeight: 480,
          backgroundColor: '#000000', icon: ICON, autoHideMenuBar: true, webPreferences,
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  contents.on('context-menu', (_event, params) => buildContextMenu(contents, params).popup());
});

function buildContextMenu(contents, params) {
  const items = [];
  const h = contents.navigationHistory;
  if (params.linkURL && /^https?:/i.test(params.linkURL)) {
    items.push(
      { label: 'Havolani brauzerda ochish', click: () => openExternal(params.linkURL) },
      { label: 'Havolani nusxalash', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' },
    );
  }
  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: 'Rasmni nusxalash', click: () => contents.copyImageAt(params.x, params.y) }, { type: 'separator' });
  }
  if (params.isEditable) {
    items.push(
      { label: 'Bekor qilish', role: 'undo', enabled: params.editFlags.canUndo },
      { label: 'Qaytarish', role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { label: 'Kesish', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Nusxalash', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Qo‘yish', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Hammasini belgilash', role: 'selectAll' },
      { type: 'separator' },
    );
  } else if (params.selectionText && params.selectionText.trim()) {
    items.push({ label: 'Nusxalash', role: 'copy' }, { type: 'separator' });
  }
  items.push(
    { label: 'Orqaga', enabled: h.canGoBack(), click: () => h.goBack() },
    { label: 'Oldinga', enabled: h.canGoForward(), click: () => h.goForward() },
    { label: 'Yangilash', click: () => contents.reload() },
  );
  return Menu.buildFromTemplate(items);
}

/* -------------------------------------------------------------- app menu */

function focused() {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return win && !win.isDestroyed() ? win : null;
}

function buildAppMenu() {
  const withContents = (fn) => () => { const w = focused(); if (w) fn(w.webContents, w); };
  const template = [
    {
      label: 'Fayl',
      submenu: [
        { label: 'Bosh sahifa', accelerator: 'Alt+Home', click: withContents((wc) => wc.loadURL(config.url)) },
        { label: 'Joriy sahifani brauzerda ochish', click: withContents((wc) => isSameApp(wc.getURL()) && openExternal(wc.getURL())) },
        { label: 'Havolani nusxalash', accelerator: 'CmdOrCtrl+Shift+C', click: withContents((wc) => isSameApp(wc.getURL()) && clipboard.writeText(wc.getURL())) },
        { type: 'separator' },
        { label: 'Chiqish', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'Tahrirlash',
      submenu: [
        { label: 'Bekor qilish', role: 'undo' },
        { label: 'Qaytarish', role: 'redo' },
        { type: 'separator' },
        { label: 'Kesish', role: 'cut' },
        { label: 'Nusxalash', role: 'copy' },
        { label: 'Qo‘yish', role: 'paste' },
        { label: 'Hammasini belgilash', role: 'selectAll' },
      ],
    },
    {
      label: 'Ko‘rinish',
      submenu: [
        { label: 'Yangilash', accelerator: 'CmdOrCtrl+R', click: withContents((wc) => wc.reload()) },
        { label: 'Yangilash', accelerator: 'F5', visible: false, acceleratorWorksWhenHidden: true, click: withContents((wc) => wc.reload()) },
        { label: 'Keshsiz yangilash', accelerator: 'CmdOrCtrl+Shift+R', click: withContents((wc) => wc.reloadIgnoringCache()) },
        { type: 'separator' },
        { label: 'Kattalashtirish', accelerator: 'CmdOrCtrl+=', click: withContents((wc) => wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4))) },
        { label: 'Kattalashtirish', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: withContents((wc) => wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4))) },
        { label: 'Kichiklashtirish', accelerator: 'CmdOrCtrl+-', click: withContents((wc) => wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3))) },
        { label: 'Asl o‘lcham', accelerator: 'CmdOrCtrl+0', click: withContents((wc) => wc.setZoomLevel(0)) },
        { type: 'separator' },
        { label: 'To‘liq ekran', accelerator: 'F11', click: withContents((_wc, w) => w.setFullScreen(!w.isFullScreen())) },
        { label: 'Dasturchi vositalari', accelerator: 'CmdOrCtrl+Shift+I', visible: !app.isPackaged, enabled: !app.isPackaged, click: withContents((wc) => wc.toggleDevTools()) },
      ],
    },
    {
      label: 'O‘tish',
      submenu: [
        { label: 'Orqaga', accelerator: 'Alt+Left', click: withContents((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
        { label: 'Oldinga', accelerator: 'Alt+Right', click: withContents((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
      ],
    },
    {
      label: 'Yordam',
      submenu: [
        {
          label: 'FAITH haqida',
          click: () => dialog.showMessageBox(focused() || undefined, {
            type: 'info',
            title: 'FAITH haqida',
            message: `FAITH ${app.getVersion()}`,
            detail: `Manzil: ${config.url}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
            icon: ICON,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* --------------------------------------------------------------- session */

function setUpSession() {
  const ses = session.defaultSession;
  ses.setUserAgent(app.userAgentFallback);
  ses.setSpellCheckerEnabled(false);

  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen', 'notifications', 'pointerLock']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL();
    callback(isSameApp(origin) && allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => isSameApp(requestingOrigin) && allowed.has(permission));

  // Downloads (Excel exports, receipts, backups, purchased files): offer the Downloads folder, report when done.
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    item.once('done', (_e, state) => {
      if (state !== 'completed' || !Notification.isSupported()) return;
      const file = item.getSavePath();
      const n = new Notification({ title: 'Yuklab olindi', body: path.basename(file), icon: ICON, silent: true });
      n.on('click', () => shell.showItemInFolder(file));
      n.show();
    });
  });
}

/* --------------------------------------------------------------- start up */

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'; // dark title bar to match FAITH's black
  setUpSession();
  buildAppMenu();
  createSplash();
  createMainWindow();
});

app.on('window-all-closed', () => app.quit());
