import { jsonDateParser } from "json-date-parser"
const browser = require("webextension-polyfill");
const path = require('path')

module.exports = storage

function storage () {
  if (!(this instanceof storage)) return new storage ()
}

storage.prototype.fetch = async function (url, options) {
  return browser.runtime.sendMessage({action: "fetch", url, options})
}

storage.prototype.mkdir = async function (dest) {
  return null
}

storage.prototype.localGet = async function (path, def) {
  return browser.runtime.sendMessage({action: "localGet", path}).
    then(obj => {
      if (typeof(obj) === 'string')
        obj = JSON.parse(obj, jsonDateParser)
      return obj || def
    })
}

storage.prototype.localSet = async function (path, data) {
  return browser.runtime.sendMessage({action: "localSet", path,
    data: JSON.stringify(data)})
}

storage.prototype.readFile = async function (path, raw) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage({action: "readFile", path, raw}).
      then(obj => {
        if (typeof(obj) === 'string' && !raw)
          obj = JSON.parse(obj, jsonDateParser)
        if (!obj)
          reject()
        else
          resolve(obj)
      })
  })
}

storage.prototype.writeFile = async function (path, data, raw) {
  if (!raw)
    data = JSON.stringify(data)
  return browser.runtime.sendMessage({action: "writeFile", path, data})
}

storage.setup = function (fn) {
  storage.user = storage()
  fn()
}
