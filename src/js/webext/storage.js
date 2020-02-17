//
// The platform-specific code for web extensions. (Relies heavily on the
// webextension-polyfill, which acts as a common API between Firefox and
// Chrome.)
//
import { jsonDateParser } from "json-date-parser"
import { xpathDom } from '../util'
const browser = require("webextension-polyfill")
const frago = require('../frago')
const path = require('path')

class WebextStorage {
  constructor(id) {
    this.id = id 
    this.dom = new DOMParser()
    this.userAgent = 'X-FC-User-Agent'
    this.tabs = {}
    this.baseHref = browser.runtime.getURL ?
      browser.runtime.getURL('/').slice(0, -1) : ''
    this.xpath = xpathDom
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
    return frago.merge(items, subkey, this.decode)
  }

  async writeSynced(items, subkey, ids) {
    // console.log(["OUTGOING", items, ids])
    let id = this.encode([this.id, new Date()])
    if (subkey && subkey in items) {
      await frago.separate(items, subkey, ids, (k, v) =>
        browser.storage.sync.set({[k]: this.encode(v), id}))
      delete items[subkey]
      delete items.index
    }

    let len = 0
    for (let k in items) {
      items[k] = this.encode(items[k])
      len++
    }
    if (len > 0) {
      items.id = id
      await browser.storage.sync.set(items)
    }
  }

  //
  // Messaging functions.
  //
  server(fn) {
    browser.runtime.onMessage.addListener(async (msg, sender) => {
      if (sender.tab) {
        msg.sender = sender.tab.id
        this.tabs[sender.tab.id] = new Date()
        if (msg.data)
          msg.data = this.decode(msg.data)
        fn(msg)
      }
      return true
    })
  }

  client(fn) {
    browser.runtime.onMessage.addListener(async (msg) => {
      fn(this.decode(msg))
      return true
    })
  }

  command(action, data) {
    if (data)
      data = this.encode(data)
    browser.runtime.sendMessage({action, data}).then(console.log, console.error)
  }

  update(data, receiver) {
    data = this.encode(data)
    let tabs = (receiver ? [receiver] : Object.keys(this.tabs))
    for (let id of tabs) {
      browser.tabs.sendMessage(Number(id), data).
        catch(e => delete this.tabs[id])
    }
  }

  //
  // Called once to initialize the background script
  //
  backgroundSetup() {
    browser.storage.onChanged.addListener((dict, area) => {
      if (area !== "sync" || !('id' in dict))
        return

      // Only handle messages from other IDs.
      let sender = this.decode(dict.id.newValue)
      if (sender[0] === this.id)
        return

      let changes = {}
      for (let path in dict)
        changes[path] = dict[path].newValue
      this.onSync(changes)
    })

    let extUrl = browser.extension.getURL("/")
    let rewriteUserAgentHeader = e => {
      if (e.tabId === -1 && e.initiator && extUrl && extUrl.startsWith(e.initiator)) {
        let hdrs = [], ua = null
        for (var header of e.requestHeaders) {
          let name = header.name.toLowerCase()
          if (name === "x-fc-user-agent") {
            ua = header
          } else if (name !== "user-agent") {
            hdrs.push(header)
          }
        }

        if (ua !== null) {
          hdrs.push({name: 'User-Agent', value: ua.value})
          return {requestHeaders: hdrs}
        }
      }
      return {requestHeaders: e.requestHeaders}
    }

    browser.browserAction.onClicked.addListener(tab => {
      browser.tabs.create({url: "https://fraidyc.at/s/"})
    })

    browser.webRequest.onBeforeSendHeaders.addListener(rewriteUserAgentHeader,
      {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"])
  }
}

module.exports = async function () {
  let session = Math.random().toString(36)
  return new WebextStorage(session)
}
