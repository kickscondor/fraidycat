//
// src/electron-index.js
//
// import 'babel-polyfill'
import images from '../../images/*.png'
const { Worker, isMainThread, parentPort } = require('worker_threads')
const { app, BrowserWindow, ipcMain, webContents, Menu, Tray } = require('electron')
const path = require('path')
const openAboutWindow = require('about-window').default

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
        click: () => bg.show()
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
      { label: 'About Fraidycat',
        click: () => openAboutWindow(path.resolve(__dirname, "../../", images['flatcat-512'])) }
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
    webPreferences: {nodeIntegration: true},
    icon: path.resolve(__dirname, "../../", images['flatcat-32'])
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  win.loadURL(`file://${path.resolve(__dirname, "../../index.html")}`)
  win.on("close", ev => {
    if (app.isQuiting) {
      win = null
    } else {
      ev.preventDefault()
      win.hide()
    }
    return false
  })
  win.on("minimize", ev => {
    ev.preventDefault()
    win.hide()
  })
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

var tray
app.on("ready", () => {
  tray = new Tray(path.resolve(__dirname, "../../", images['flatcat-32']))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Fraidycat', click: () => win.show() },
    { label: 'Quit', click: () => {
      app.isQuiting = true
      app.quit() 
    } }
  ])
  tray.setToolTip('Fraidycat')
  tray.setContextMenu(contextMenu)
  tray.on("click", () => win.show())
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
