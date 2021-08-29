const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'
const isLinux = (!isMac && !isWindows)
const debug = process.env.DEBUG === '1'

const profile = process.env.APPDATA ||
  (isMac ? process.env.HOME + '/Library/Preferences' :
   process.env.HOME + "/.fraidycat")

module.exports = { isMac, isWindows, isLinux, debug, profile }

