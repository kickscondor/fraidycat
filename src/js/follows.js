import { getIndexById, urlToID, urlToNormal } from './util'
import { jsonDateParser } from "json-date-parser"
import feedycat from './feedycat'
const compare = require('./compare')
const quicklru = require('quick-lru')
let storage = null
if (process.env.STORAGE === 'dat') {
  storage = require('./storage/dat')
} else {
  storage = require('./storage/webext')
}
const url = require('url')

function fetchedAt(fetched, id) {
  let fetch = fetched[id]
  return fetch ? fetch.at : 0
}

function isOutOfDate(follow, fetched) {
  let imp = Number(follow.importance)
  let age = (new Date()) - (fetchedAt(fetched, follow.id) || 0)
  if (imp < 1) {
    // Real-time is currently a five minute check.
    return age > (5 * 60 * 1000)
  } else if (imp < 2) {
    // Daily check is half-hourly.
    return age > (30 * 60 * 1000)
  } else if (imp < 60) {
    // Monthly checks are twice a day.
    return age > (12 * 60 * 60 * 1000)
  } else {
    // Older is a check once a week.
    return age > (7 * 24 * 60 * 60 * 1000)
  }
}

export default ({
  state: {all: [], updating: [], fetched: {}, started: false, postCache: new quicklru({maxSize: 1000})},
  actions: {
    init: () => (_, {startup}) => {
      storage.setup(() => {
        storage.user.readFile('/follows.json').then(all => {
          startup({all, started: true})
        }, err => {
          startup({started: true})
        })
      })
    },
    startup: obj => (_, {poll, set}) => {
      storage.user.localGet('fraidycat', {fetched: {}}).then(saved => {
        Object.assign(obj, saved)
        console.log(obj)
        set(obj)
        setInterval(poll, 5000)
      })
    },
    markFetched: follow => ({fetched}, {set}) => {
      if (follow.response) {
        fetched[follow.id] = Object.assign(follow.response, {at: new Date()})
        storage.user.localSet('fraidycat', {fetched})
        delete follow.response
        set({fetched})
      }
    },
    poll: () => async ({all, fetched, updating}, {markFetched, set, write}) => {
      let qual = all.filter(follow => !updating.includes(follow) && isOutOfDate(follow, fetched))
      if (qual.length > 0) {
        let oldest = qual.reduce((old, follow) => (fetchedAt(fetched, old.id) || 0) > (fetchedAt(fetched, follow.id) || 0) ? follow : old)
        if (oldest) {
          updating.push(oldest)
          set({updating})
          console.log(`Updating ${oldest.title || oldest.actualTitle}`)
          await feedycat(storage, oldest, fetched[oldest.id])
          markFetched(oldest)
          updating = updating.filter(follow => follow != oldest)
          set({updating})
          write(all)
        }
      }
    },
    write: (all) => (_, {location, set}) => {
      storage.user.writeFile('/follows.json', all).then(() => {
        set({all})
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
    getPosts: id => ({postCache}, {set}) => {
      let posts = postCache.get(id)
      if (posts == null) {
        postCache.set(id, [])
        storage.user.readFile(`/feeds/${id}.json`).then(meta => {
          postCache.set(id, meta.posts)
          set({postCache})
        }, err => {})
      }
      return posts
    },
    getPostDetails: ({id, post}) => ({postCache}, {set}) => {
      if (post) {
        let fullId = `${id}/${post.publishedAt.getFullYear()}/${post.id}`
        let deets = postCache.get(fullId)
        if (deets == null) {
          postCache.set(fullId, {})
          storage.user.readFile(`/feeds/${fullId}.json`).then(obj => {
            postCache.set(fullId, obj)
            set({postCache})
          }, err => {})
        }
        return deets
      }
    },
    save: follow => async ({all, fetched}, {markFetched, location, set, write}) => {
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

      markFetched(follow)
      if (savedId) {
        all[idx] = follow
      } else {
        all.push(follow)
      }

      write(all)
      location.go("/")
    },
    remove: follow => ({all}, {location, write}) => {
      if (confirm("Delete " + follow.url + "?")) {
        let idx = getIndexById(all, follow.id)
        if (idx >= 0)
          all.splice(idx, 1)

        write(all)
        location.go("/")
      }
    },

    add: (e) => (_, {location, set}) => {
      e.preventDefault()
      set({editing: {importance: 0}})
      location.go("/add")
    },
    edit: (e, follow) => (_, {location, set}) => {
      e.preventDefault()
      set({editing: JSON.parse(JSON.stringify(follow), jsonDateParser)})
      location.go("/edit")
    }
  }
})
