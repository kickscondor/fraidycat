const path = require('path')

module.exports = storage

function storage (url) {
  if (!(this instanceof storage)) return new storage (url)
  this.dat = new DatArchive(url)
}

storage.prototype.mkdir = function (path, fn) {
  this.dat.mkdir(path).then(fn, fn)
}

storage.prototype.readFile = function (path, fn) {
  this.dat.readFile(path).then(str => fn(null, str), err => fn(err, null))
}

storage.prototype.writeFile = function (dest, obj, fn) {
  this.mkdir(path.dirname(dest), err => {
    let data = typeof(obj) == "string" ? obj : JSON.stringify(obj)
    this.dat.writeFile(dest, data).then(fn, fn)
  })
}

storage.user = storage(window.location)
