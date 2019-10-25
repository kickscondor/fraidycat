import { jsonDateParser } from "json-date-parser"
import { getMaxIndex, responseToObject } from '../util'
const browser = require("webextension-polyfill");
const path = require('path')

class WebextStorage {
  constructor(id) {
    this.id = id 
  }

  encode(obj) {
    return JSON.stringify(obj)
  }

  decode(str) {
    return JSON.parse(str, jsonDateParser)
  }

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
      browser.storage.sync.get(null).then(items => {
        let master = this.mergeSynced(items, subkey)
        resolve(master)
      })
    })
  }

  mergeSynced(items, subkey) {
    let master = {[subkey]: {}}
    if (items.master) {
      Object.assign(master, this.decode(items.master))
      let len = getMaxIndex(master.index)
      for (let i = 0; i <= len; i++) {
        Object.assign(master[subkey], this.decode(items[`${subkey}/${i}`]))
      }
    }
    return master
  }

  async writeSynced(subkey, ids, obj) {
    //
    // Build all the parts in advance.
    //
    let high = 0
    let synced = {master: {}}
    for (let k in obj.index) {
      let i = obj.index[k]
      if (i > high)
        high = i

      let s = synced[`${subkey}/${i}`] || {}
      s[k] = obj[subkey][k]
      synced[`${subkey}/${i}`] = s
    }

    for (let k in obj) {
      if (k != subkey)
        synced.master[k] = obj[k]
    }

    //
    // Attempt to save each piece - if it fails, take off an item and try again.
    //
    for (let i = 0; i <= high; i++) {
      if (ids.includes(i)) {
        let k = `${subkey}/${i}`
        try {
          synced.master.at = new Date()
					await browser.storage.sync.set({[k]: this.encode(synced[k]),
            master: this.encode(synced.master), id: this.id})
        } catch (e) {
          let id = Object.keys(synced[k]).pop()
          delete synced[k][id]
          if (i === high) {
            high++
					  synced[`${subkey}/${high}`] = {}
          }
          if (!ids.includes(high))
						ids.push(high)
          synced.master.index[id] = high

					synced[`${subkey}/${high}`][id] = obj[subkey][id]
          i--
        }
      }
    }
  }

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
