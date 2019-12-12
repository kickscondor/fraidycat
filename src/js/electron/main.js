//
// src/electron-index.js
//
// import 'babel-polyfill'
import images from '../../images/*.png'
const { Worker, isMainThread, parentPort } = require('worker_threads')
const { app, BrowserWindow, ipcMain, webContents, Menu, Tray } = require('electron')
const path = require('path')

//
// Manage window open/close
//
let bg, win
let template = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  {
    label: "View",
    submenu: [
      { role: 'reload' },
      { role: 'forcereload' },
      { role: 'toggledevtools' },
      {
        label: 'Background Window',
        click: function() { bg.show(); }
      },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  { role: 'windowMenu' },
  { role: 'help',
    submenu: [
      { label: 'About Fraidycat' }
    ]
  }
]

function createWindow() {
  bg = new BrowserWindow({
    webPreferences: {nodeIntegration: true},
    show: false
  })

  bg.loadURL(`file://${path.resolve(__dirname, "../../background.html")}`)

  win = new BrowserWindow({
    width: 900,
    height: 680,
    webPreferences: {nodeIntegration: true}
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  win.loadURL(`file://${path.resolve(__dirname, "../../index.html")}`)
  win.on("closed", () => (win = null))
}

ipcMain.handle("fraidy", (e, msg) => {
  if (msg.receiver) {
    webContents.fromId(msg.receiver).send('fraidy', msg)
  } else {
    for (var wc of webContents.getAllWebContents()) {
      if (wc.id !== msg.sender) {
        wc.send('fraidy', msg)
      }
    }
  }
})

app.on("ready", () => {
  let tray = new Tray(path.resolve(__dirname, "../../", images['favicon-64']))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Background', click: function () { bg.show() } },
    { label: 'Exit', click: function () { app.quit() } }
  ])
  tray.setToolTip('Fraidycat')
  tray.setContextMenu(contextMenu)
  createWindow()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (win === null) {
    createWindow()
  }
})
