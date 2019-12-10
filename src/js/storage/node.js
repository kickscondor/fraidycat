import { responseToObject } from '../util'
import { jsonDateParser } from "json-date-parser"
const fs = require('fs')
const path = require('path')
const util = require("util")

class NodeStorage {
  constructor(session, ipc) {
    this.session = session
    this.ipc = ipc
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
  fetch(resource, init) {
    let req = new Request(url, options)
    return fetch(req).then(responseToObject)
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

  async readFile(path, raw) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(raw ? data : this.decode(data))
        }
      })
    })
  }

  async writeFile(dest, obj, raw) {
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

  async writeSynced(subkey, ids, obj) {
    return this.writeFile("/sync/" + subkey + ".json", obj)
  }

  //
  // Messaging functions.
  //
  receiveMessage(fn) {
    this.ipc.handle('fraidycat', async (event, ...args) => {
      let msg = this.decode(args[0], jsonDateParser)
      return fn(msg)
    })
  }

  sendMessage(obj) {
    return this.ipc.invoke('fraidycat', this.encode(obj))
  }


  //
  // Needs to be backgrounded?
  //
  command(action, data) {
    if (action === 'setup') {
      this.receiveMessage(msg => {
        if (msg.action === 'update')
          return data(msg.data)
      })
      return this.sendMessage({action})
    }
    return this.sendMessage({action, data})
  }
}

module.exports = async function (ipc) {
  let session = Math.random().toString(36)
  return new NodeStorage(session, ipc)
}
