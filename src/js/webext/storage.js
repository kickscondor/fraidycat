//
// The platform-specific code for web extensions. (Relies heavily on the
// webextension-polyfill, which acts as a common API between Firefox and
// Chrome.)
//
import { jsonDateParser } from "json-date-parser"
import { fixupHeaders, parseDom, xpathDom } from '../util'
const browser = require("webextension-polyfill")
const frago = require('../frago')
const path = require('path')
const homepage = 'https://fraidyc.at/s/'

const FIREFOX_QUOTA_BYTES_PER_ITEM = 8192;

class WebextStorage {
  constructor(id) {
    this.id = id 
    this.dom = parseDom
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
    let req = new Request(url, fixupHeaders(options, ['Cookie', 'User-Agent']))
    return fetch(req)
  }

  async render(req, tasks) {
    let site = this.scraper.options[req.id]
    let iframe = document.createElement("iframe")
    iframe.src = req.url
    return new Promise((resolve, reject) => {
      this.scraper.addWatch(req.url, {tasks, resolve, reject, iframe, render: req.render,
        remove: () => {
          iframe.src = "about:blank"
          setTimeout(() => iframe.remove(), 1000)
        }})
      iframe.addEventListener('load', e => {
        iframe.contentWindow.postMessage(this.encode({url: req.url, tasks, site}), '*')
      })
      document.body.appendChild(iframe)
      setTimeout(() => this.scraper.removeWatch(req.url), 40000)
    })
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

  async deleteFile(path) {
    return browser.storage.local.remove(path)
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
      await frago.separate(items, subkey, ids, (k, v) => {
        let kv = {[k]: this.encode(v)}
        if (k.length + kv[k].length > FIREFOX_QUOTA_BYTES_PER_ITEM) {
          throw "QUOTA_BYTES_PER_ITEM quota exceeded."
        }
        return browser.storage.sync.set({...kv, id})
      })
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
    browser.runtime.sendMessage({action, data})
  }

  sendUpdate(data, tabs) {
    for (let id of tabs) {
      browser.tabs.sendMessage(id, this.encode(data))
    }
  }

  update(data, receiver) {
    if (receiver) {
      this.sendUpdate(data, [receiver])
    } else {
      browser.tabs.query({url: homepage}).then(tabs =>
        this.sendUpdate(data, tabs.map(x => x.id)))
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

    window.addEventListener('message', e => {
      let {url, tasks, error} = this.decode(e.data)
      this.scraper.updateWatch(url, tasks, error)
    }, false)

    let extUrl = browser.extension.getURL("/")
    let rewriteUserAgentHeader = e => {
      // console.log(e)
      let initiator = e.initiator || e.originUrl
      if (e.tabId === -1 && initiator && extUrl && (initiator + "/").startsWith(extUrl)) {
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

    //
    // Open Fraidycat if the extension icon or the "Follow" icon is clicked.
    //
    browser.browserAction.onClicked.addListener(tab => {
      browser.tabs.create({url: homepage})
    })

    // browser.pageAction.onClicked.addListener(tab => {
    //   browser.tabs.create({url: homepage + "#!/add?url=" +
    //     encodeURIComponent(tab.url)})
    // })

    browser.webRequest.onBeforeSendHeaders.addListener(rewriteUserAgentHeader,
      {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"])

    browser.webRequest.onHeadersReceived.addListener(e => {
      let initiator = e.initiator || e.originUrl
      let headers = e.responseHeaders
      if (e.tabId === -1 && initiator && extUrl && (initiator + "/").startsWith(extUrl)) {
        for (let i = headers.length - 1; i >= 0; --i) {
          let header = headers[i].name.toLowerCase()
          if (header == 'x-frame-options' || header == 'frame-options') {
            headers.splice(i, 1)
          }
        }
      }
      return {responseHeaders: headers};
    }, {urls: ["<all_urls>"]}, ["blocking", "responseHeaders"])

    browser.webRequest.onCompleted.addListener(async e => {
      let headers = e.responseHeaders
      if (e.tabId === -1 && e.parentFrameId === 0) {
        this.onRender(e.url)
      }
    }, {urls: ["<all_urls>"], types: ["xmlhttprequest"]})

    browser.tabs.query({url: homepage}).then(tabs => {
      tabs.map(x => browser.tabs.reload(x.id))})

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "loading" && changeInfo.url?.startsWith('http')) {
        this.urlDetails(changeInfo.url).then(({found, feed}) => {
          // console.log(`${changeInfo.url} => ${can}`)
          if (found === 1) {
            try {
              feed = JSON.parse(JSON.stringify(feed))
              if (feed.sources?.length > 5) {
                feed.sources = feed.sources.slice(0, 5)
              }
              browser.browserAction.setIcon({tabId, path: "images/portrait.svg"})
              browser.browserAction.setTitle({tabId, title: "Follow with Fraidycat"})
              browser.browserAction.setPopup({tabId, popup: "popup.html?feed=" +
                encodeURIComponent(JSON.stringify(feed))})
            } catch {}
          }
        })
      }
    })
  }
}

async function clearAll() {
  browser.storage.sync.get().
    then(o => browser.storage.sync.remove(Object.keys(o)))
  browser.storage.local.get().
    then(o => browser.storage.local.remove(Object.keys(o)))
}

module.exports = async function () {
  // clearAll()
  let session = Math.random().toString(36)
  return new WebextStorage(session)
}
