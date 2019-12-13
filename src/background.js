//
// src/background.js
//
import './js/environment'
import 'babel-polyfill'
const mixin = require('./js/storage')
const storage = require('./js/storage-platform')

//
// This script runs in the background, fetching feeds and communicating
// stuff to the foreground pages. So Fraidycat can do its work so long as
// the browser is open.
//
let start = async function () {
  let local = await storage()
  Object.assign(local, mixin)
  console.log(`Started up Fraidycat background script. (${local.id})`)
  local.receiveMessage(msg => {
    if (msg.action !== 'updated')
      local[msg.action](msg.data, msg.sender)
  })
  local.backgroundSetup()
}
start()
