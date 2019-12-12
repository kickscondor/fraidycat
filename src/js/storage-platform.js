let storage = null

if (process.env.STORAGE === 'dat') {
  storage = require('./dat/storage')
} else if (process.env.STORAGE === 'webext') {
  storage = require('./webext/storage')
} else {
  storage = require('./electron/storage')
}

module.exports = storage
