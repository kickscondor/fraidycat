import { responseToObject } from '../util'
import { jsonDateParser } from "json-date-parser"
const compare = require('../compare')
const path = require('path')

module.exports = storage

function storage (url) {
  if (!(this instanceof storage)) return new storage (url)
  if (url instanceof DatArchive) this.dat = url
  else this.dat = new DatArchive(url)
}

storage.prototype.fetch = function (resource, init) {
  return experimental.globalFetch(resource, init).then(responseToObject)
}

storage.prototype.mkdir = async function (dest) {
  let par = path.dirname(dest)
  if (par.length > 1)
    await this.mkdir(par).catch(() => {})
  return this.dat.mkdir(dest)
}

storage.prototype.localGet = async function (key, def) {
  let str = window.localStorage.getItem(key)
  return str ? JSON.parse(str, jsonDateParser) : def
}

storage.prototype.localSet = async function (key, def) {
  return window.localStorage.setItem(key, JSON.stringify(def))
}

storage.prototype.readFile = async function (path, raw) {
  return this.dat.readFile(path).then(str => raw ? str : JSON.parse(str, jsonDateParser))
}

storage.prototype.writeFile = async function (dest, obj, raw) {
  await this.mkdir(path.dirname(dest)).catch(() => {})
  let data = raw ? obj : JSON.stringify(obj)
  let orig = null
  try {
    orig = await this.dat.readFile(dest)
    if (!raw) {
      // Reload both of these objects from strings, so they can
      // properly be compared. We don't want to write duplicate objects:
      // they clutter up the Dat.
      orig = JSON.parse(orig)
      obj = JSON.parse(data)
    }
  } catch (e) {
    // console.log(dest, e)
  }
  if (orig && compare(orig, obj))
    return null
  return this.dat.writeFile(dest, data)
}

storage.setup = function (fn) {
  let userDat = window.localStorage.getItem('userDat')
  if (!userDat) {
    DatArchive.create({title: "Fraidycat Follows",
      description: "My personal collection of Fraidycat follows.",
      type: ["fraidycat"]}).
    then(dat => {
      storage.user = storage(dat)
      window.localStorage.setItem('userDat', dat.url)
      fn()
    })
  } else {
    storage.user = storage(userDat)
    fn()
  }
}
