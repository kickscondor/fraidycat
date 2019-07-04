const compare = require('./compare')
const path = require('path')

module.exports = storage

function storage (url) {
  if (!(this instanceof storage)) return new storage (url)
  if (url instanceof DatArchive) this.dat = url
  else this.dat = new DatArchive(url)
}

storage.prototype.mkdir = async function (dest) {
  let par = path.dirname(dest)
  if (par.length > 1)
    await this.mkdir(par).catch(() => {})
  return this.dat.mkdir(dest)
}

storage.prototype.readFile = async function (path) {
  return this.dat.readFile(path)
}

storage.prototype.writeFile = async function (dest, obj) {
  await this.mkdir(path.dirname(dest)).catch(() => {})
  let data = typeof(obj) == "string" ? obj : JSON.stringify(obj)
  let orig = null
  try {
    orig = await this.dat.readFile(dest)
    if (typeof(obj) != "string") {
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
