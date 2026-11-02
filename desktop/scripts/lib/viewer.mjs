// A bare Electron window for the screenshot script (not the app): shows one local file at an exact
// content size, for a picture of a frozen design draft or of the side-by-side page.
//   STREAMS_VIEW_URL   file:///…  ·  STREAMS_VIEW_W, STREAMS_VIEW_H   content size  ·  STREAMS_VIEW_DATA  its own data folder
import { app, BrowserWindow, Menu } from 'electron'

app.setPath('userData', process.env.STREAMS_VIEW_DATA)
app.enableSandbox()
Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: Number(process.env.STREAMS_VIEW_W),
    height: Number(process.env.STREAMS_VIEW_H),
    useContentSize: true,
    show: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.loadURL(process.env.STREAMS_VIEW_URL)
})
app.on('window-all-closed', () => app.quit())
