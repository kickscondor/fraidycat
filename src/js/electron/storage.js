const { remote, ipcRenderer } = require('electron')
import { xpathDom } from '../util'
import { jsonDateParser } from "json-date-parser"
const fs = require('fs')
const path = require('path')
const util = require('util')

class NodeStorage {
  constructor(session) {
    this.session = session
    this.id = remote.getCurrentWebContents().id
    this.dom = new DOMParser()
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
    let req = new Request(url, options)
    return fetch(req)
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

  //
  // This needs to sync with the Firefox Sync
  //
  async readSynced(subkey) {
    return this.readFile("/sync/" + subkey + ".json")
  }

  async writeSynced(obj, subkey, ids) {
    return this.writeFile("/sync/" + subkey + ".json", obj)
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
    obj.sender = this.id
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

  backgroundSetup() { }
}

module.exports = async function () {
  let session = Math.random().toString(36)
  return new NodeStorage(session)
}
