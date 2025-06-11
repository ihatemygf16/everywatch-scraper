const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
    },
  });

  const indexPath = path.join(__dirname, 'everywatch-client', 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  // 🔒 Intercept external link attempts and open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  const serverScript = path.join(__dirname, 'server.js');
  const nodeBinary = path.join(__dirname, 'embedded-node', 'node.exe');

  serverProcess = spawn(nodeBinary, [serverScript], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: true,
  });
  serverProcess.unref();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
  if (serverProcess) serverProcess.kill();
});
