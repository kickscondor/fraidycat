//
// src/electron.js
//
import 'babel-polyfill'
import { responseToObject } from './js/util'
const browser = require('webextension-polyfill')
const mixin = require('./js/storage')
const storage = require('./storage/electron')

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const path = require("path");
//
// This script runs in the background, fetching feeds and communicating
// stuff to the foreground pages. So Fraidycat can do its work so long as
// the browser is open.
//
let start = async function () {
  let local = await storage(electron.ipcMain)
  Object.assign(local, mixin)
  console.log(`Started up Fraidycat main process. (${local.id})`)

  local.setup(data => {
    local.sendMessage({action: 'update', data}).
      catch(err => console.log(err))
  })

  local.receiveMessage(msg => {
    if (msg.action !== 'update')
      return local[msg.action](msg.data)
  })
}
start()

//
// Manage window open/close
//
let mainWindow, backWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    webPreferences: {
      nodeIntegration: true
    }
  });

  backWindow.addWindow(mainWindow);
  mainWindow.loadURL(`file://${path.join(__dirname, "../build/electron/index.html")}`);
  mainWindow.on("closed", () => (mainWindow = null));
}

app.on("ready", () => {
  backWindow = main.createBackgroundProcess('file://' + __dirname + '/electron.html', true);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
