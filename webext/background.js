import 'babel-polyfill'
import { responseToObject } from '../src/js/util'
const browser = require("webextension-polyfill")
const session = Math.random().toString(36)

//
// This script simply wraps the fetch API and the storage.local API
// so that src/js/storage/webext.js can communicate with it.
//
console.log(`Started up Fraidycat background script. (${session})`)
browser.runtime.onMessage.addListener((msg, sender, resp) => {
  console.log(msg)
  switch (msg.action) {
    case "fetch":
      let req = new Request(msg.url, msg.options)
      console.log(req)
      return fetch(req).then(responseToObject)
    case "localGet":
    case "readFile":
      return browser.storage[msg.path.startsWith('~') ? 'sync' : 'local'].
        get(msg.path).then(items => items[msg.path])
    case "localSet":
    case "writeFile":
      return browser.storage[msg.path.startsWith('~') ? 'sync' : 'local'].
        set({[msg.path]: msg.data})
    case "session":
      return new Promise((resolve, _) => resolve({id: session}))
  }
})

browser.storage.onChanged.addListener((dict, area) => {
  if (area !== "sync")
    return
  for (let path in dict)
    browser.runtime.sendMessage({action: area, path, data: dict[path].newValue})
})

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: "index.html"})
})
