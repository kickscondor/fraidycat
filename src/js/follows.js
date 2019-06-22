const normalizeUrl = require('normalize-url')
const storage = require('./storage')
const url = require('url')

const getIndexById = (ary, id) => {
  for (let i = 0; i < ary.length; i++) {
    if (ary[i].id == id)
      return i
  }
  return -1
}

const urlToID = link => {
  let normLink = normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
  let hashInt = normLink.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)
  return `${normLink.split('/')[0]}-${(hashInt >>> 0).toString(16)}`
}

export default ({
  state: {follows: []},
  actions: {
    save: follow => ({follows}, {location, set}) => {
      let savedId = !!follow.id
      follow.id = urlToID(follow.url)
      if (!follow.createdAt) follow.createdAt = new Date()
      follow.updatedAt = new Date()

      let idx = getIndexById(follows, follow.id)
      if (!savedId && idx >= 0) {
        alert('This feed already exists.')
        return
      }

      if (savedId)
        follows[idx] = follow
      else
        follows.push(follow)

      storage.user.writeFile('/follows.json', follows, _ => {
        set({follows: follows})
      })
    },
    remove: follow => (state, _) => {
    }
  }
})
