const Sequelize = require('sequelize')
const Umzug = require('umzug')
const { fixupHeaders, responseToObject } = require('../util')
const { jsonDateParser } = require("json-date-parser")
const { DOMParser } = require('@xmldom/xmldom')
const ent = require('ent/decode')
const compare = require('../compare')
const fetch2 = require('electron-fetch')
const fs = require('fs')
const path = require('path')
const rfs = require('rotating-file-stream')
const mixin = require('../storage')
const { Global, Caches, connect } = require('./models')
const xpath = require('xpath')

function innerHtml(node) {
  let v = node.value || (node.nodeValue ? ent(node.nodeValue) : null)
  if (v) return v

  if (node.hasChildNodes())
  {
    v = ''
    for (let c = 0; c < node.childNodes.length; c++) {
      let n = node.childNodes[c]
      v += n.value || (n.nodeValue ? ent(n.nodeValue) : n.toString())
    }
  }
  return v
}

function xpathSelect(doc, node, path, asText, namespaces) {
  let result = xpath.parse(path).select({node, allowAnyNamespaceForNoPrefix: true,
    caseInsensitive: true, namespaces})
  if (asText)
    return result.map(innerHtml)
  return result
}

function parseDom(str, mime) {
  return new DOMParser().parseFromString(str, mime)
}

class ServerStorage {
  constructor(opts) {
    this.db = new Sequelize({ dialect: 'sqlite',
      storage: path.join(opts.profile, '/db.sqlite')});
    connect(this.db)
    this.profile = opts.profile
    this.onionId = null
    this.dom = parseDom
    this.xpath = xpathSelect
    this.ports = []

    let logPath = path.join(opts.profile, 'logs')
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, {recursive: true})
    }
    this.logStream = rfs.createStream(path.join(logPath, 'server.log'), {
      size: "1M", interval: "1d", compress: "gzip", maxFiles: 7})
    this.log("Starting up Fraidycat server.")
  }

  addPort(port) {
    if (this.ports.indexOf(port) === -1) {
      this.ports.push(port)
    }
  }

  removePort(port) {
    let n = this.ports.indexOf(port)
    if (n !== -1) {
      this.ports.splice(n, 1)
    }
  }

  log(message, type = 'INFO') {
    let date = new Date()
    let timestamp = `${("0" + date.getUTCFullYear()).slice(-2)}-${("0" + (date.getUTCMonth() + 1)).slice(-2)}-${("0" + date.getUTCDate()).slice(-2)} ${("0" + date.getUTCHours()).slice(-2)}:${("0" + date.getUTCMinutes()).slice(-2)}:${("0" + date.getUTCSeconds()).slice(-2)}`
    if (typeof(message) !== 'string') message = JSON.stringify(message)
    this.logStream.write(`[${timestamp}] [${type.toUpperCase()}]: ${message}\n`)
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
  fetch(url, options) {
    return fetch2.default(url, fixupHeaders(options, ['Cookie', 'User-Agent']))
  }

  async mkdir(dest) {
    return new Promise((resolve, reject) => {
      fs.mkdir(dest, {recursive: true}, err => {
        resolve()
      })
    })
  }

  async localGet(key, def) {
    let obj = await Global.findByPk(key)
    return obj ? this.decode(obj.json) : def
  }

  async localSet(key, def) {
    await Global.upsert({key, json: this.encode(def)})
  }

  async readFile(dest, raw) {
    dest = path.join(this.profile, dest)
    return new Promise((resolve, reject) => {
      fs.readFile(dest, (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(raw ? data : this.decode(data))
        }
      })
    })
  }

  async writeFile(dest, obj, raw) {
    dest = path.join(this.profile, dest)
    await this.mkdir(path.dirname(dest))
    let data = raw ? obj : this.encode(obj)
    return new Promise((resolve, reject) => {
      fs.writeFile(dest, data, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async deleteFile(file) {
    file = path.join(this.profile, file)
    return new Promise((resolve, reject) => {
      fs.unlink(file, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async listFiles(dir) {
    dir = path.join(this.profile, dir)
    return new Promise((resolve, reject) => {
      fs.readdir(dir, (err, files) => {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
  }

  //
  // There is no 'sync' for the desktop app.
  //
  async readSynced(subkey) {
    let ary = Caches.findAll()
    let obj = {}
    for (let item of ary) {
      if (item.path.startsWith("fraidycat.")) {
        obj[item.path.substr(10)] = this.decode(item.content)
      }
    }
    console.log(obj)
    return obj
  }

  async writeSynced(items, subkey, ids) {
    for (let k in items) {
      await Caches.upsert({path: "fraidycat." + k, ownerId: 1, content: this.encode(items[k])})
    }
  }

  //
  // Whitelist of WebSocket and API commands - to prevent private calls from
  // being accessible and to define permissions.
  //
  dispatch(action, data, port) {
    switch (action) {
      case "fraidycat.changeSetting":
        this.changeSetting(data)
      break
      case "fraidycat.exportTo":
        this.exportTo(data, port)
      break
      case "fraidycat.loadPosts":
        this.loadPosts(data, port)
      break
      case "fraidycat.remove":
        this.remove(data, port)
      break
      case "fraidycat.rename":
        this.rename(data, port)
      break
      case "fraidycat.save":
        this.save(data, port)
      break
      case "fraidycat.setup":
        this.setup(data, port)
      break
      case "fraidycat.subscribe":
        this.subscribe(data, port)
      break
      default: break
    }
  }

  command(action, data) {
    this.log(`The command(${action}) method not available on the server.`)
  }

  //
  // Send updated data through the WebSocket, if it's connected.
  //
  update(data, port) {
    let obj = this.encode({action: 'fraidycat.updated', data})
    this.log(obj)
    if (port) {
      this.sendMessage(port, obj)
    } else {
      this.ports.map(port => this.sendMessage(port, obj))
    }
  }

  sendMessage(port, obj) {
    try {
      port.postMessage(obj)
    } catch (e) {
      this.log(e)
    }
  }

  async init(migrate) {
    let umzug = new Umzug({migrations: {path: './migrations',
      params: [this.db.getQueryInterface()]},
       storage: 'sequelize', storageOptions: {sequelize: this.db}})
    await umzug.up()

    this.setup({})
    // let pair = require('keypair')()
    // fs.writeFile(this.profile + '/key.pem')
    // console.log(pair)
  }
}

Object.assign(ServerStorage.prototype, mixin)

module.exports = async function (opts) {
  return new ServerStorage(opts)
}
