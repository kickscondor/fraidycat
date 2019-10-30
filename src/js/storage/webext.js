//
// The platform-specific code for web extensions. (Relies heavily on the
// webextension-polyfill, which acts as a common API between Firefox and
// Chrome.)
//
import { jsonDateParser } from "json-date-parser"
import { responseToObject } from '../util'
const browser = require("webextension-polyfill");
const path = require('path')

class WebextStorage {
  constructor(id) {
    this.id = id 
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
    return fetch(req).then(responseToObject)
  }

  async mkdir(dest) {
    return null
  }

  async localGet(path, def) {
    return browser.storage.local.
      get(path).then(items => {
        let obj = items[path]
        if (typeof(obj) === 'string')
          obj = this.decode(obj)
        return (obj || def)
      })
  }

  async localSet(path, data) {
    return browser.storage.local.
      set({[path]: this.encode(data)})
  }

  async readFile(path, raw) {
    return new Promise((resolve, reject) => {
      browser.storage.local.get(path).then(items => {
          let obj = items[path]
          if (typeof(obj) === 'string' && !raw)
            obj = this.decode(obj)
          if (!obj)
            reject()
          else
            resolve(obj)
        })
    })
  }

  async writeFile(path, data, raw) {
    if (!raw)
      data = this.encode(data)
    return browser.storage.local.set({[path]: data})
  }

  //
  // The following 'Synced' functions all do I/O to browser.storage.sync. (The
  // synced data for an extension.)
  //
  // Since you can only sync 8k JSON files (up to 512 of them), I'll need to
  // split up the sync file into pieces. I've decided to do this chronologically -
  // so the first split would contain the first N (in addition order) and so on.
  // This is all managed by a master index that lists what goes where.
  //
  // The object being read/written needs to have an `index` key with an object
  // of `id`: `part` pairing - `part` being the number of the piece containing
  // an object by that `id`. The `subkey` param points to the subkey that's
  // being indexed.
  //
  async readSynced(subkey) {
    return new Promise((resolve, reject) => {
      browser.storage.sync.get(null).then(items =>
        resolve(this.mergeSynced(items, subkey)))
    })
  }

  //
  // Loads synced data, building the index as we go.
  //
  mergeSynced(items, subkey) {
    let master = {[subkey]: {}, index: {}, maxIndex: 0}
    for (let k in items) {
      let km = k.split('/'), data = this.decode(items[k])
      if (km[0] === subkey) {
        let n = Number(km[1])
        if (n > master.maxIndex)
          master.maxIndex = n
        for (let id in data)
          master.index[id] = n
        Object.assign(master[km[0]], data)
      } else {
        master[km[0]] = data
      }
    }
    return master
  }

  async writeSynced(subkey, ids, obj) {
    //
    // Build all the parts in advance.
    //
    let synced = {}, parts = []
    for (let k in obj.follows) {
      let i = obj.index[k]
      if (typeof(i) === 'undefined')
        obj.index[k] = i = obj.maxIndex
      let s = synced[`${subkey}/${i}`] || {}
      s[k] = obj[subkey][k]
      synced[`${subkey}/${i}`] = s
      if (ids.includes(k) && !parts.includes(i))
        parts.push(i)
    }

    //
    // Attempt to save each piece - if it fails, take off an item and try again.
    //
    for (let i = 0; i <= obj.maxIndex; i++) {
      if (parts.includes(i)) {
        let k = `${subkey}/${i}`
        try {
					await browser.storage.sync.set({[k]: this.encode(synced[k]),
            id: this.encode([this.id, new Date()])})
        } catch (e) {
          let id = Object.keys(synced[k]).pop()
          delete synced[k][id]
          if (i === obj.maxIndex) {
            obj.maxIndex++
					  synced[`${subkey}/${obj.maxIndex}`] = {}
          }
          if (!parts.includes(obj.maxIndex))
						parts.push(obj.maxIndex)
          obj.index[id] = obj.maxIndex

					synced[`${subkey}/${obj.maxIndex}`][id] = obj[subkey][id]
          i--
        }
      }
    }

    return await browser.storage.sync.set({settings: this.encode(obj.settings),
      id: this.encode([this.id, new Date()])})
  }

  //
  // Messaging functions.
  //
  receiveMessage(fn) {
    browser.runtime.onMessage.addListener((msg, sender, resp) => {
      if (msg.data)
        msg.data = this.decode(msg.data, jsonDateParser)
      return fn(msg)
    })
  }

  sendMessage(obj) {
    if (obj.data)
      obj.data = this.encode(obj.data)
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage(obj).then(resp => {
        if (resp && resp.error)
          reject(resp.error)
        else
          resolve(resp)
      })
    })
  }

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

module.exports = async function () {
  let session = Math.random().toString(36)
  return new WebextStorage(session)
}
