//
// src/electron-index.js
//
// Electron-specific customizations and window dressing. Also, notification of
// updates are down at the end.
//
import '../../js/environment'
import 'regenerator-runtime/runtime'
import images from '../../images/*.png'
const openAboutWindow = require('about-window').default
const { app, BrowserWindow, ipcMain, webContents, Menu, session, shell, Tray } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isLinux = (!isMac && !isWindows)
const DEBUG = false

const homepage = 'https://fraidyc.at/'
const bug_report_url = 'https://github.com/kickscondor/fraidycat/issues'

//
// Without this, uncaught errors (esp in electron-updater) will become alerts.
//
process.on('uncaughtException', e => console.log(e))

//
// Setup the common actions and menus that may be used.
//
var bg = null, win = null

const about = () => openAboutWindow({
  homepage, bug_report_url,
  icon_path: path.resolve(__dirname, "../../", images['flatcat-512']),
  win_options: {
    autoHideMenuBar: true,
    resizable: false
  }
})

const quit = () => {
  app.isQuitting = true
  app.quit() 
}

function link(label, url)
{
  return { label, click: () => shell.openExternal(url) }
}

const template = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { label: 'About Fraidycat', click: about },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { label: 'Quit Fraidycat', accelerator: 'CmdOrCtrl+Q', click: quit }
    ]
  }] : []),
  {
    label: 'File',
    submenu: [
      { label: 'Show', accelerator: 'CmdOrCtrl+N',
        click: () => win && win.show() },
      { label: 'Hide', accelerator: 'CmdOrCtrl+W',
        click: () => win && win.hide() }
    ]
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      ...(DEBUG ? [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },	
        { label: 'Show Background Window', click: () => bg.show() },
        { type: 'separator' }] : []),
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  { role: 'windowMenu' },
  {
    role: 'help',
    submenu: [
      link('Fraidyc.at', homepage),
      link('Search Issues', bug_report_url)
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

//
// This is the context menu on input boxes, for copy/paste and such.
// Attached down in createWindow().
//
const selectionMenu = Menu.buildFromTemplate([
  {role: 'copy'},
  {type: 'separator'},
  {role: 'selectall'},
])

const inputMenu = Menu.buildFromTemplate([
  {role: 'undo'},
  {role: 'redo'},
  {type: 'separator'},
  {role: 'cut'},
  {role: 'copy'},
  {role: 'paste'},
  {type: 'separator'},
  {role: 'selectall'},
])

//
// Manage window open/close
//
function createWindow() {
  bg = new BrowserWindow({
    webPreferences: {nodeIntegration: true, webviewTag: true},
    show: false
  })

  //
  // Used to rewrite the user-agent.
  //
  bg.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    // console.log(details.requestHeaders)
    if (details.requestHeaders['X-FC-User-Agent'])
      details.requestHeaders['User-Agent'] = details.requestHeaders['X-FC-User-Agent']
    callback({cancel: false, requestHeaders: details.requestHeaders})
  })

  //
  // Used to whack the x-frame-options header.
  //
  bg.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'subFrame') {
      if (details.responseHeaders['x-frame-options'])
        delete details.responseHeaders['x-frame-options']
      if (details.responseHeaders['frame-options'])
        delete details.responseHeaders['frame-options']
    }
    callback({cancel: false, responseHeaders: details.responseHeaders})
  })

  bg.loadURL(`file://${path.resolve(__dirname, "../../background.html")}`)

  win = new BrowserWindow({
    minWidth: 380, width: 900,
    minHeight: 320, height: 680,
    show: false,
    webPreferences: {nodeIntegration: true},
    icon: path.resolve(__dirname, "../../", images['flatcat-32'])
  })

  //
  // Add context menu to text inputs. (by gabriel)
  // https://github.com/electron/electron/issues/4068#issuecomment-274159726
  //
  win.webContents.on('context-menu', (e, props) => {
    const { selectionText, isEditable } = props
    if (isEditable) {
      inputMenu.popup(win)
    } else if (selectionText && selectionText.trim() !== '') {
      selectionMenu.popup(win)
    }
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
    if (!DEBUG) { win.setMenuBarVisibility(false) }
    win.show()
  })
  for (let w of [bg, win]) {
    w.on("close", ev => {
      if (isLinux && w === win) {
        quit()
      }
      if (!app.isQuitting) {
        ev.preventDefault()
        w.hide()
      }
      return false
    })
  }
}

//
// Ensure there is only one Fraidycat window running. Fetching all of these
// feeds is taxing and work shouldn't be duplicated.
//
var canRun = app.requestSingleInstanceLock()
if (!canRun) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show()
      win.focus()
    }
  })

  //
  // Central messaging channel. The two foreground and background pass messages
  // through here.
  //
  ipcMain.handle("fraidy", (e, msg) => {
    if (msg.action === 'autoUpdateApproved') {
      app.isQuitting = true
      autoUpdater.quitAndInstall()  
    } else if (msg.receiver) {
      webContents.fromId(msg.receiver).send('fraidy', msg)
    } else {
      for (var wc of webContents.getAllWebContents()) {
        if (wc.id !== msg.sender) {
          wc.send('fraidy', msg)
        }
      }
    }
  })

  //
  // On Windows, a systray icon is used to keep the app in the
  // background and allow follows to update there.
  //
  var tray
  app.once("ready", async () => {
    if (isWindows) {
      tray = new Tray(path.resolve(__dirname, "../../", images['flatcat-32']))
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Fraidycat', click: () => win.show() },
        ...(DEBUG ? [
          { label: 'Background', click: () => bg.show() },
          { label: 'Update', click: () => {	
            for (var wc of webContents.getAllWebContents()) {	
              wc.send('fraidy', {action: 'updated', data:
                JSON.stringify({op: 'autoUpdate', version: '1.0.8'})})	
            } } }] : []),
        { label: 'About', click: about },
        { label: 'Quit', click: quit }
      ])
      tray.setToolTip('Fraidycat')
      tray.setContextMenu(contextMenu)
      tray.on("click", () => win.show())
    }
    createWindow()
    autoUpdater.checkForUpdatesAndNotify()
  })

  if (!isWindows) {
    app.on("before-quit", () => {
      app.isQuitting = true
    })
  }

  app.on("window-all-closed", () => {
    app.quit()
  })

  app.on("activate", () => {
    if (win === null) {
      createWindow()
    }
  })
}

//	
// Update notifications setup and debug	
//	
autoUpdater.on('update-not-available', () => {	
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(),	
    1000 * 60 * 15)	
})	

autoUpdater.on('update-downloaded', info => {	
  for (var wc of webContents.getAllWebContents()) {	
    wc.send('fraidy', {action: 'updated', data:
      JSON.stringify({op: 'autoUpdate', version: info.version})})	
  }	
})
