const { remote, ipcRenderer } = require('electron')
import { fixupHeaders, parseDom, xpathDom } from '../util'
import { jsonDateParser } from "json-date-parser"
const fs = require('fs')
const path = require('path')
const util = require('util')

class ElectronStorage {
  constructor(session) {
    this.session = session
    this.webContents = remote.getCurrentWebContents()
    this.dom = parseDom
    this.appPath = path.join(remote.app.getPath('userData'), 'File Storage')
    this.xpath = xpathDom
    this.baseHref = ''
  }

  //
  // JSON convenience.
  //
  encode(obj) {
    return JSON.stringify(obj)
  }

  decode(str) {
    return JSON.parse(str, jsonDateParser)
  }

  //
  // I/O functions.
  //
  async fetch(url, options) {
    let req = new Request(url, fixupHeaders(options, ['Cookie', 'User-Agent']))
    return fetch(req)
  }

  async render(req, tasks) {
    let site = this.scraper.options[req.id]
    let iframe = document.createElement("webview")
    iframe.preload = "./js/electron/content-script.js"
    iframe.enableremotemodule = false
    iframe.src = req.url
    return new Promise((resolve, reject) => {
      this.scraper.addWatch(req.url, {tasks, resolve, reject, iframe, render: req.render,
        remove: () => {
          iframe.src = "about:blank"
          setTimeout(() => iframe.remove(), 1000)
        }})
      iframe.addEventListener('dom-ready', () => {
        iframe.send('scrape', {url: req.url, tasks, site})
      })
      iframe.addEventListener('ipc-message', e => {
        let {url, tasks, error} = e.args[0]
        this.scraper.updateWatch(url, tasks, error)
      })
      // iframe.addEventListener('console-message', e =>
      //   console.log(["WebView", e.message]))
      document.body.appendChild(iframe)
      setTimeout(() => this.scraper.removeWatch(req.url), 40000)
    })
  }

  async mkdir(dest) {
    return new Promise((resolve, reject) => {
      fs.mkdir(dest, {recursive: true}, err => {
        resolve()
      })
    })
  }

  async localGet(key, def) {
    let str = window.localStorage.getItem(key)
    return str ? this.decode(str) : def
  }

  async localSet(key, def) {
    return window.localStorage.setItem(key, this.encode(def))
  }

  async readFile(dest, raw) {
    dest = path.join(this.appPath, dest)
    return new Promise((resolve, reject) => {
      fs.readFile(dest, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(raw ? data : this.decode(data))
        }
      })
    })
  }

  async writeFile(dest, obj, raw) {
    dest = path.join(this.appPath, dest)
    await this.mkdir(path.dirname(dest))
    let data = raw ? obj : this.encode(obj)
    return new Promise((resolve, reject) => {
      fs.writeFile(dest, data, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async deleteFile(file) {
    file = path.join(this.appPath, file)
    return new Promise((resolve, reject) => {
      fs.unlink(file, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async listFiles(dir) {
    dir = path.join(this.appPath, dir)
    return new Promise((resolve, reject) => {
      fs.readdir(dir, (err, files) => {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
  }

  //
  // This needs to sync with the Firefox Sync
  //
  async readSynced(subkey) {
    let files = await this.listFiles("/sync") 
    let obj = {}
    for (let file of files) {
      if (file.endsWith(".json")) {
        let name = path.basename(file, ".json")
        Object.assign(obj, await this.readFile("/sync/" + file))
      }
    }
    return obj
  }

  async writeSynced(items, subkey, ids) {
    for (let k in items) {
      await this.writeFile("/sync/" + k + ".json", {[k]: items[k]})
    }
  }

  //
  // Messaging functions.
  //
  // The 'fraidy' channel is how messages are sent. Replies are made - on
  // 'fraidy-<id>' channel to the sender.
  //
  server(fn) {
    ipcRenderer.on('fraidy', (e, msg) => {
      // console.log(msg)
      if (msg.action !== 'updated') {
        if (msg.data)
          msg.data = this.decode(msg.data)
        fn(msg)
      }
    })
  }

  client(fn) {
    ipcRenderer.on('fraidy', (e, msg) => {
      // console.log(msg)
      if (msg.action === 'updated') {
        if (msg.data)
          msg.data = this.decode(msg.data)
        fn(msg.data)
      }
    })
  }

  sendMessage(obj) {
    obj.sender = this.webContents.id
    if (obj.data)
      obj.data = this.encode(obj.data)
    return ipcRenderer.invoke('fraidy', obj)
  }

  command(action, data) {
    this.sendMessage({action, data})
  }

  update(data, receiver) {
    this.sendMessage({action: 'updated', data, receiver})
  }

  backgroundSetup() {
    //
    // Watch iframe script loading, to allow interception of API calls.
    //
    this.webContents.session.webRequest.onCompleted(details => {
      if (details.resourceType === 'xhr' && details.webContentsId !== this.webContents.id) {
        // console.log(details.url)
        this.onRender(details.url)
      }
    })
  }
}

module.exports = async function () {
  let session = Math.random().toString(36)
  return new ElectronStorage(session)
}
