import { getIndexById } from './util'
import { jsonDateParser } from "json-date-parser"
const normalizeUrl = require('normalize-url')
const storage = require('./storage')
const url = require('url')

const urlToID = link => {
  let normLink = normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
  let hashInt = normLink.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)
  return `${normLink.split('/')[0]}-${(hashInt >>> 0).toString(16)}`
}

export default ({
  state: {all: [], started: false},
  actions: {
    init: () => (_, {set}) => {
      storage.user.readFile('/follows.json', (err, data) => {
        if (data) {
          let all = JSON.parse(data, jsonDateParser)
          console.log(all)
          set({all, started: true})
        }
      })
    },
    write: all => (_, {location, set}) => {
      storage.user.writeFile('/follows.json', all, _ => {
        set({all})
        location.go("/")
      })
    },
    save: follow => ({all}, {write}) => {
      let savedId = !!follow.id
      follow.id = urlToID(follow.url)
      if (!follow.createdAt) follow.createdAt = new Date()
      follow.updatedAt = new Date()

      let idx = getIndexById(all, follow.id)
      if (!savedId && idx >= 0) {
        alert('This feed already exists.')
        return
      }

      if (savedId)
        all[idx] = follow
      else
        all.push(follow)

      write(all)
    },
    remove: follow => ({all}, {write}) => {
      if (confirm("Delete " + follow.url + "?")) {
        let idx = getIndexById(all, follow.id)
        if (idx >= 0)
          all.splice(idx, 1)

        write(all)
      }
    }
  }
})
