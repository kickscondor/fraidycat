//
// webext/background.js
//
import 'babel-polyfill'
import { responseToObject } from './js/util'
const browser = require('webextension-polyfill')
const storage = require('./js/storage/webext')
const mixin = require('./js/storage')

//
// This script runs in the background, fetching feeds and communicating
// stuff to the foreground pages. So Fraidycat can do its work so long as
// the browser is open.
//
let start = async function () {
  let local = await storage()
  Object.assign(local, mixin)
  console.log(`Started up Fraidycat background script. (${local.id})`)

  local.setup(data => {
    local.sendMessage({action: 'update', data}).
      catch(err => console.log(err))
  })

  local.receiveMessage(msg => {
    if (msg.action !== 'update')
      return local[msg.action](msg.data)
  })

  browser.storage.onChanged.addListener((dict, area) => {
    if (area !== "sync")
      return
    // console.log([area, dict])
    let changes = {}
    for (let path in dict)
      changes[path] = dict[path].newValue
    local.onSync(changes)
  })
}
start()

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: "index.html"})
})
