//
// src/js/follows.js
//
// The logic behind adding, removing, fetching and syncing follows.
// So the central flow of everything is here. Specifics on handling
// different sources is in src/js/feedycat.js.
//
// The overall architecture of Fraidycat looks like this:
//
// * Local metadata listing all follows and recent posts.
//   a. follows.json: All follows, last ten posts, basic stats.
//   b. follows/feed-id.json: Individual follow metadata.
//   c. follows/feed-id/post-id.json: Locally cached post.
// * Synced metadata. (settings.json) Lists all inputted metadata for a
//   follow.
//
// The synced metadata is very minimal - it's up to the local Fraidycat
// instance to pull down feeds and operate independently. This allows the
// instance to run alone, with no syncing, should the user want it that way.
//
import { getIndexById } from './util'
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
  state: {all: {}, updating: [], fetched: {}, started: false,
    settings: {broadcast: false, follows: {}},
    postCache: new quicklru({maxSize: 1000})},
  actions: {
    //
    // On startup, check for synced data from other sources (other browsers,
    // other dats) and setup sync events.
    //
    init: () => (_, {poll, set, startup, sync}) => {
      storage.setup(() => {
        let obj = {started: true}
        storage.user.onSync(change => sync(change.object))
        storage.user.readFile('/follows.json').
          then(all => obj.all = all).catch(_ => 0).
          finally(() => {
            storage.user.localGet('fraidycat', {fetched: {}}).then(saved => {
              Object.assign(obj, saved)
              set(obj)
              storage.user.readFile('~/settings.json').
                then(sync).catch(_ => 0).finally(_ => setInterval(poll, 5000))
            })
          })
      })
    },

    //
    // Store metadata about last fetch, last caching data for a follow.
    //
    markFetched: follow => ({fetched}, {set}) => {
      if (follow.response) {
        fetched[follow.id] = Object.assign(follow.response, {at: new Date()})
        storage.user.localSet('fraidycat', {fetched})
        delete follow.response
        set({fetched})
      }
    },

    //
    // Periodically update a follow.
    //
    poll: () => async ({all, fetched, updating}, {markFetched, set, write}) => {
      let qual = Object.values(all).
        filter(follow => !updating.includes(follow) && isOutOfDate(follow, fetched))
      if (qual.length > 0) {
        let oldest = qual.reduce((old, follow) =>
          (fetchedAt(fetched, old.id) || 0) > (fetchedAt(fetched, follow.id) || 0) ? follow : old)
        if (oldest) {
          updating.push(oldest)
          set({updating})
          console.log(`Updating ${oldest.title || oldest.actualTitle}`)
          await feedycat(storage, oldest, fetched[oldest.id])
          markFetched(oldest)
          updating = updating.filter(follow => follow != oldest)
          set({all, updating})
          write(false)
        }
      }
    },

    //
    // Saving, fetching and reading follows. I/O of any kind.
    //

    //
    // Update local follows with anything added from synced sources (other
    // browsers, other dats owned by the user) or removed as well.
    //
    sync: inc => async ({all, settings}, {fetch, set, write}) => {
      if ('follows' in inc) {
        let updated = false
        console.log(inc)
        for (let id in inc.follows) {
          let current = all[id], incoming = inc.follows[id]
          if (!current || current.editedAt < incoming.editedAt) {
            if (incoming.deleted) {
              if (current)
                delete all[id]
            } else {
              if (current)
                incoming.id = id
              await fetch(incoming).
                catch(msg => console.log(`${incoming.url} is ${msg}`))
            }
            updated = true
          }
        }

        if (updated) {
          set({all, settings})
          write(false)
        }
      }
    },

    //
    // Save a single follow, after add or edit.
    //
    save: follow => (_, {fetch, location, set, write}) => {
      follow.editedAt = new Date()
      fetch(follow).then(feeds => {
        if (feeds) {
          set({feeds: {list: feeds, site: follow}})
          location.go("/add-feed")
        } else {
          write(true)
          location.go("/")
        }
      }).catch(msg => {
        location.go("/")
        alert(`${follow.url} is ${msg}`)
      })
    },

    //
    // Subscribe to follows from a list found within an HTML page.
    //
    subscribe: fc => async (_, {fetch, location, write}) => {
      let sel = fc.list.filter(feed => feed.selected), errors = [], success = false
      for (let feed of sel) {
        let hsh = {url: url.resolve(fc.site.url, feed.href),
          importance: fc.site.importance, tags: fc.site.tags, title: fc.site.title,
          editedAt: new Date()}
        if (sel.length > 1) {
          hsh['title'] = `${fc.site.title || fc.site.actualTitle} [${feed.title}]`
        }
        await fetch(hsh).then(feeds => {
          if (feeds) {
            errors.push(`${hsh.url} is not a feed.`)
          } else {
            success = true
          }
        }).catch(msg => errors.push(`${hsh.url} is ${msg}`))
      }
      if (success)
        write(true)
      location.go("/")
      if (errors.length > 0)
        alert(errors.join("\n"))
    },

    //
    // Get all posts from a given follow.
    //
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

    //
    // Get full post contents from a follow.
    //
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

    //
    // Fetch a follow from a remote source, updating its local metadata.
    //
    fetch: follow => async ({all, fetched, settings}, {markFetched, location, set}) => {
      let savedId = !!follow.id
      if (!savedId) {
        if (!follow.url.match(/^\w+:\/\//))
          follow.url = "http://" + follow.url
        follow.createdAt = new Date()
      }
      follow.updatedAt = new Date()

      let feeds = await feedycat(storage, follow)
      if (feeds)
        return feeds
      
      if (!savedId && all[follow.id])
        throw 'already a subscription of yours.'

      markFetched(follow)
      all[follow.id] = follow
      settings.follows[follow.id] = {url: follow.feed, tags: follow.tags,
        importance: follow.importance, title: follow.title,
        fetchesContent: follow.fetchesContent, editedAt: follow.editedAt}
    },

    //
    // Write the master list (and the sync list, possibly) to disk.
    //
    write: (updateSettings) => ({all, settings}, _) => {
      storage.user.writeFile('/follows.json', all).then(() => {
        if (updateSettings) {
          if (storage.user.id)
            settings.id = storage.user.id
          storage.user.writeFile('~/settings.json', settings)
        }
      })
    },

    //
    // Delete confirmation event from HTML.
    //
    confirmRemove: follow => ({all, settings}, {location, remove, set, write}) => {
      if (confirm("Delete " + follow.url + "?")) {
        delete all[follow.id]
        settings.follows[follow.id] = {deleted: true, editedAt: new Date()}
        set({all, settings})
        write(true)
        location.go("/")
      }
    },
  }
})
