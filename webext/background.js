import 'babel-polyfill'
import { responseToObject } from '../src/js/util'
const browser = require("webextension-polyfill");

//
// This script simply wraps the fetch API and the storage.local API
// so that src/js/storage/webext.js can communicate with it.
//
console.log("Started up Fraidycat background script.")
browser.runtime.onMessage.addListener((msg, sender, resp) => {
  console.log(msg)
  switch (msg.action) {
    case "fetch":
      let req = new Request(msg.url, msg.options)
      console.log(req)
      return fetch(req).then(responseToObject)
    case "localGet":
    case "readFile":
      return browser.storage.local.get(msg.path).then(items => items[msg.path])
    case "localSet":
    case "writeFile":
      return browser.storage.local.set({[msg.path]: msg.data})
  }
  return new Promise({message: "Hello!"})
})

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: "index.html"})
})
