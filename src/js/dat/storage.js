import { responseToObject } from '../util'
import { jsonDateParser } from "json-date-parser"
const compare = require('../compare')
const path = require('path')
const mixin = require('../storage')

class DatStorage {
  constructor(dat) {
    this.dat = dat
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
    return str ? this.decode(str) : def
  }

  async localSet(key, def) {
    return window.localStorage.setItem(key, this.encode(def))
  }

  async readFile(path, raw) {
    return this.dat.readFile(path).then(str => raw ? str : this.decode(str))
  }

  async writeFile(dest, obj, raw) {
    await this.mkdir(path.dirname(dest)).catch(() => {})
    let data = raw ? obj : this.encode(obj)
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

  //
  // On Beaker, for simplicity, the synced follow file will be read from a
  // single large file. However, I don't have a way yet of adding other dats
  // from the Fraidycat interface---I am hoping to use the new multi-writer
  // Hypercore at some point. Otherwise, I'll need to use the `watch` API
  // on a list of dats. (And perhaps the peer API, too, to notify the original
  // dat.) Multiwriter hypercore just can't come soon enough...
  //
  async readSynced(subkey) {
    return this.readFile("/sync/" + subkey + ".json")
  }

  async writeSynced(obj, subkey, ids) {
    return this.writeFile("/sync/" + subkey + ".json", obj)
  }

  //
  // Since everything is handled in the foreground in Beaker (the fetch API
  // is already backgrounded), we just do straight method calls. No need for
  // a messaging API.
  //
  receiveMessage(fn) {
    this.updated = fn
  }

  command(action, data) {
    return this[action](data)
  }

  update(data, receiver) {
    this.updated(data)
  }
}

Object.assign(DatStorage.prototype, mixin)

module.exports = async function () {
  let dat = window.localStorage.getItem('userDat')
  if (!dat) {
    dat = await DatArchive.create({title: "Fraidycat Follows",
      description: "My personal collection of Fraidycat follows.",
      type: ["fraidycat"]})
    window.localStorage.setItem('userDat', dat.url)
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
