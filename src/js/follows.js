import { getIndexById, urlToID, urlToNormal } from './util'
import { jsonDateParser } from "json-date-parser"
import feedycat from './feedycat'
const storage = require('./storage')
const url = require('url')

function lastPostTime(follow) {
  let lastPost = follow.posts[0]
  return lastPost ? lastPost.updatedAt : new Date(0)
}

export default ({
  state: {all: [], started: false},
  actions: {
    init: () => (_, {set}) => {
      storage.setup(() => {
        storage.user.readFile('/follows.json').then(data => {
          let all = JSON.parse(data, jsonDateParser)
          set({all, started: true})
        }, err => {
          set({started: true})
        })
      })
    },
    write: all => (_, {location, set}) => {
      all.sort((a, b) => (a.importance - b.importance) || (lastPostTime(b) - lastPostTime(a)))
      storage.user.writeFile('/follows.json', all).then(() => {
        set({all})
        location.go("/")
      })
    },
    subscribe: fc => (_, {save}) => {
      let sel = fc.list.filter(feed => feed.selected)
      sel.forEach(feed => {
        let hsh = {url: url.resolve(fc.site.url, feed.href),
          importance: fc.site.importance, tags: fc.site.tags, title: fc.site.title}
        if (sel.length > 1) {
          hsh['title'] = `${fc.site.title || fc.site.actualTitle} [${feed.title}]`
        }
        save(hsh)
      })
    },
    save: follow => async ({all}, {location, set, write}) => {
      let savedId = !!follow.id
      if (!savedId) {
        if (!follow.url.match(/^\w+:\/\//))
          follow.url = "http://" + follow.url
        let normalizedUrl = urlToNormal(follow.url)
        follow.id = urlToID(normalizedUrl)
        follow.createdAt = new Date()
      }
      follow.updatedAt = new Date()

      let idx = getIndexById(all, follow.id)
      if (!savedId && idx >= 0) {
        alert('This feed already exists.')
        return
      }

      let feeds = await feedycat(storage, follow)
      if (feeds) {
        set({feeds: {list: feeds, site: follow}})
        location.go("/add-feed")
        return
      }

      idx = getIndexById(all, follow.id)
      if (!savedId && idx >= 0) {
        alert('This feed already exists.')
        return
      }

      if (savedId) {
        all[idx] = follow
      } else {
        all.push(follow)
      }

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
