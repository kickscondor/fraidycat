const Sequelize = require('sequelize')
const Umzug = require('umzug')
const { responseToObject } = require('../util')
const { jsonDateParser } = require("json-date-parser")
const compare = require('../compare')
const fs = require('fs')
const path = require('path')
const mixin = require('../storage')

class ServerStorage {
  constructor(opts) {
    this.db = new Sequelize({ dialect: 'sqlite',
      storage: path.join(opts.profile, '/db.sqlite')});
    this.profile = opts.profile
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
    throw "No fetch"
  }

  async mkdir(dest) {
    return new Promise((resolve, reject) => {
      fs.mkdir(dest, {recursive: true}, err => {
        resolve()
      })
    })
  }

  async localGet(key, def) {
    throw "No localGet"
  }

  async localSet(key, def) {
    throw "No localSet"
  }

  async readFile(path, raw) {
    throw "No readFile"
  }

  async writeFile(dest, obj, raw) {
    throw "No writeFile"
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

  async setup() {
    await this.mkdir(this.profile)
    let umzug = new Umzug({migrations: {path: './migrations',
      params: [this.db.getQueryInterface()]},
       storage: 'sequelize', storageOptions: {sequelize: this.db}})
    await umzug.up()

    // let pair = require('keypair')()
    // fs.writeFile(this.profile + '/key.pem')
    // console.log(pair)
  }
}

// Object.assign(ServerStorage.prototype, mixin)

module.exports = async function (opts) {
  return new ServerStorage(opts)
}
