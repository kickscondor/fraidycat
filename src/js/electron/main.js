//
// src/electron-index.js
//
// import 'babel-polyfill'
import '../../js/environment'
import images from '../../images/*.png'
const { Worker, isMainThread, parentPort } = require('worker_threads')
const { app, BrowserWindow, ipcMain, webContents, Menu, shell, Tray } = require('electron')
const path = require('path')
const openAboutWindow = require('about-window').default

//
// Manage window open/close
//
var bg, win

function createWindow() {
  bg = new BrowserWindow({
    webPreferences: {nodeIntegration: true},
    show: false
  })

  bg.loadURL(`file://${path.resolve(__dirname, "../../background.html")}`)

  win = new BrowserWindow({
    width: 900,
    height: 680,
    show: false,
    webPreferences: {nodeIntegration: true},
    icon: path.resolve(__dirname, "../../", images['flatcat-32'])
  })

  //
  // Open links in the default browser.
  //
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== e.sender.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  win.loadURL(`file://${path.resolve(__dirname, "../../index.html")}`)
  win.once("ready-to-show", () => {
    win.setMenu(null) // DEBUG
    win.show()
  })
  win.on("close", ev => {
    if (app.isQuitting) {
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

var canRun = app.requestSingleInstanceLock()
if (!canRun) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

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
  app.once("ready", () => {
    tray = new Tray(path.resolve(__dirname, "../../", images['flatcat-32']))
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Fraidycat', click: () => win.show() },
      // { label: 'Background', click: () => bg.show() }, // DEBUG
      { label: 'About', click: () => openAboutWindow(path.resolve(__dirname, "../../", images['flatcat-512'])) },
      { label: 'Quit', click: () => {
        app.isQuitting = true
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
}
