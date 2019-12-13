let storage = null

if (process.env.STORAGE === 'dat') {
  storage = require('./dat/storage')
} else if (process.env.STORAGE === 'webext') {
  storage = require('./webext/storage')
} else if (typeof (process.versions.electron) === 'string') {
  storage = require('./electron/storage')
}

console.log(`STORAGE = ${process.env.STORAGE}`)
module.exports = storage
