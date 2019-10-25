import { responseToObject } from '../util'
import { jsonDateParser } from "json-date-parser"
const compare = require('../compare')
const path = require('path')
const mixin = require('../storage')

class DatStorage {
  constructor(dat) {
    this.dat = dat
  }

  fetch(resource, init) {
    return experimental.globalFetch(resource, init).then(responseToObject)
  }

  async mkdir(dest) {
    let par = path.dirname(dest)
    if (par.length > 1)
      await this.mkdir(par).catch(() => {})
    return this.dat.mkdir(dest)
  }

  async localGet(key, def) {
    let str = window.localStorage.getItem(key)
    return str ? JSON.parse(str, jsonDateParser) : def
  }

  async localSet(key, def) {
    return window.localStorage.setItem(key, JSON.stringify(def))
  }

  async readFile(path, raw) {
    return this.dat.readFile(path).then(str => raw ? str : JSON.parse(str, jsonDateParser))
  }

  async writeFile(dest, obj, raw) {
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

  command(action, obj) {
    return this[action](obj)
  }
}

Object.assign(DatStorage.prototype, mixin)

module.exports = async function () {
  let dat = window.localStorage.getItem('userDat')
  if (!dat) {
    dat = await DatArchive.create({title: "Fraidycat Follows",
      description: "My personal collection of Fraidycat follows.",
      type: ["fraidycat"]}).
    window.localStorage.setItem('dat', this.dat.url)
  } else {
    dat = new DatArchive(dat)
  }
  
  // dat.watch('~/settings.json')
  // dat.addEventListener('changed', ({path}) => {
  //   dat.readFile(path).then(data =>
  //     storage.onSync({path, data, object: JSON.parse(data, jsonDateParser)}))
  // })
  return new DatStorage(dat)
}
