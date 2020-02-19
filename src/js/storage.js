//
// src/js/storage.js
//
// The logic behind adding, removing, fetching and syncing follows.
// So the central flow of everything is here.
//
// The overall architecture of Fraidycat looks like this:
//
// * Local metadata listing all follows and recent posts.
//   a. follows.json: All follows, last ten posts, basic stats.
//   b. feeds/feed-id.json: Individual follow metadata.
// * Synced metadata. Lists all inputted metadata for a
//   follow.
//
// The synced metadata is very minimal - it's up to the local Fraidycat
// instance to pull down feeds and operate independently. This allows the
// instance to run alone, with no syncing, should the user want it that way.
//
import { followTitle, house, getIndexById, Importances,
  urlToFeed, urlToID, urlToNormal } from './util'
import u from '@kickscondor/umbrellajs'

const fraidyscrape = require('fraidyscrape')
const og = require('opml-generator')
const quicklru = require('quick-lru')
const sax = require('sax')
const url = require('url')

const SYNC_FULL = 1
const SYNC_PARTIAL = 2
const SYNC_EXTERNAL = 3

const POSTS_IN_MAIN_INDEX = 10
const ACTIVITY_IN_MAIN_INDEX = 180

function fetchedAt(fetched, id) {
  let fetch = fetched[id]
  return fetch ? fetch.at : 0
}

function isOutOfDate(follow, fetched) {
  let imp = Number(follow.importance)
  let age = (new Date()) - (fetchedAt(fetched, follow.id) || 0)
  if (fetched[follow.id])
    age *= ((fetched[follow.id].delay || 100) * 0.01)
  if (imp < 1) {
    // Real-time is currently a 5 to 10 minute check.
    return (5 * 60 * 1000) - age
  } else if (imp < 2) {
    // Frequent is every 1 to 2 hours.
    return (60 * 60 * 1000) - age
  } else if (imp < 8) {
    // Occassional is every 4 to 8 hours.
    return (4 * 60 * 60 * 1000) - age
  } else {
    // Longer checks are once or twice a day.
    return (12 * 60 * 60 * 1000) - age
  }
}

module.exports = {
  async setup(msg, sender) {
    let obj = {started: true, updating: {}, baseHref: this.baseHref, all: {}, settings: {}}
    if (this.started) {
      this.update(Object.assign(obj, {all: this.all, settings: this.settings}), sender)
      return
    }

    Object.assign(this, {fetched: {}, follows: {}, index: {},
      postCache: new quicklru({maxSize: 1000})})

    let pollFreq = 1000, pollDate = new Date(0), pollMod = "X"
    let fetchScraper = async () => {
      if (new Date() - pollDate > (2 * 60 * 1000)) { 
        let soc = await this.fetch("https://fraidyc.at/defs/social.json")
        let mod = soc.headers.get('last-modified')
        pollDate = new Date()
        if (pollMod !== mod) {
          let txt = await soc.text()
          let defs = JSON.parse(txt)
          this.scraper = new fraidyscrape(defs, this.dom, this.xpath,
            {useragent: this.userAgent || 'User-Agent'})
          pollMod = mod
        }
      }
    }
    let pollFn = () => {
      this.poll()
      fetchScraper()
      setTimeout(pollFn, pollFreq)
    }

    let saved = null, inc = {}
    try { obj.all = await this.readFile('/follows.json') } catch {}
    try { saved = await this.localGet('fraidycat') } catch {}
    try { inc = await this.readSynced('follows') } catch {}
    if (saved)
      Object.assign(this, saved)
    if (inc.settings)
      obj.settings = inc.settings
    Object.assign(this, obj)
    this.update(obj, sender)

    await fetchScraper()
    this.sync(inc, SYNC_FULL)
    setTimeout(pollFn, pollFreq)
  },

  toObject() {
    return {follows: this.follows, index: this.index, settings: this.settings}
  },

  //
  // Periodically update a follow.
  //
  async poll() {
    let maxToQueue = 5
    for (let id in this.all) {
      if (!maxToQueue)
        break
      let upd = this.updating[id]
      if (upd && !upd.done)
        continue
      let follow = this.all[id]
      let timeLeft = isOutOfDate(follow, this.fetched)
      if (timeLeft > 0)
        continue

      // let oldest = qual.reduce((old, follow) =>
      //   (fetchedAt(this.fetched, id) || 0) > (fetchedAt(this.fetched, id) || 0) ? follow : old)
      this.fetchfeed(follow).then(feed => {
        if (feed.fresh) {
          this.update({op: 'replace', path: `/all/${id}`, value: follow})
          this.write({update: false})
        }
      }).catch(console.log)
      maxToQueue--
    }
  },

  noteUpdate(list, isDone) {
    for (let id of list) {
      this.updating[id] = {startedAt: new Date(), done: isDone}
    }
    let clearAll = false
    for (let id in this.updating) {
      clearAll = true
      if (!this.updating[id].done) {
        clearAll = false
        break
      }
    }
    if (clearAll) {
      this.updating = {}
    }
    this.update({op: 'replace', path: '/updating', value: this.updating})
  },

  //
  // Use Fraidyscrape to figure out the requests that need to made and build
  // the feed object, updating the 'meta' object with the discovered posts and
  // metadata.
  //
  async scrape(meta) {
    let req, feed
    let tasks = this.scraper.detect(meta.feed)
    while (req = this.scraper.nextRequest(tasks)) {
      // console.log(req)
      let err = null
      try {
        //
        // 'no-cache' is used to ensure that, at minimum, a conditional request
        // is sent to check for changed content. The 'etag' will then be used
        // to determine if we need to update the item. (Don't use the 'age'
        // header - it's possible that another request could have pulled a fresh
        // request and we're now getting one out of the cache that is technically
        // fresh to this operation.)
        //
        let res = await this.fetch(req.url,
          Object.assign(req.options, {cache: 'no-cache'}))
        if (!res.ok) {
          console.log(`${req.url} is giving a ${res.status} error.`)
          err = `${req.url} is giving a ${res.status} error.`
        }

        let obj = await this.scraper.scrape(tasks, req, res)
        feed = obj.out
        if (!feed) {
          throw new Error("This follow is temporarily down.")
        }

        feed.etag = res.headers.get('etag')
          || res.headers.get('last-modified')
          || res.headers.get('date')
      } catch (e) {
        err = e.message
        if (err === "Failed to fetch")
          err = "Couldn't connect - check your spelling, be sure this URL really exists."
      }
      if (err != null)
        throw err
    }

    //
    // Merge the new posts into the feed's master post list.
    //
    let sortedBy = this.settings['mode-updates'] || 'publishedAt'
    let fresh = (feed.etag !== meta.etag || sortedBy !== meta.sortedBy)
    if (!fresh) {
      console.log(`${meta.feed} hasn't changed.`)
    }
    if (fresh && feed.posts) {
      let now = new Date()
      //
      // If all entries have identical titles, use the descriptions.
      //
      let ident = 0
      if (feed.posts.length > 1) {
        let firstTitle = feed.posts[0].title
        if (firstTitle) {
          ident = feed.posts.filter(item => item.title === firstTitle).length
          if (ident != feed.posts.length)
            ident = 0
        }
      }

      //
      // Normalize the post entries for display.
      //
      let posts = []
      for (let item of feed.posts) {
        if (typeof(item.url) !== 'string' ||
          (item.publishedAt && item.publishedAt > now))
          continue
        item.id = item.url.replace(/^([a-z]+:\/+[^\/#]+)?[\/#]*/, '').replace(/\W+/g, '_')
        let i = getIndexById(meta.posts, item.id), index = null
        if (i < 0) {
          index = {id: item.id, url: item.url, createdAt: now}
          if (feed.flags !== 'COMPLETE') {
            meta.posts.unshift(index)
          }
        } else {
          index = meta.posts[i]
        }
        if (feed.flags === 'COMPLETE') {
          posts.push(index)
        }

        index.title = (ident === 0 && item.title) || item.text
        if (!index.title)
          index.title = u("<div>" + item.html).text()
        if (!index.title && item.publishedAt)
          index.title = item.publishedAt.toLocaleString()
        if (!index.title && ident !== 0)
          index.title = item.title
        index.title = index.title.toString().trim()
        index.publishedAt = item.publishedAt || index.publishedAt || index.createdAt
        index.updatedAt = (item.updatedAt && item.updatedAt < now ? item.updatedAt : index.publishedAt)
      }
      if (feed.flags === 'COMPLETE') {
        meta.posts = posts
      }
      delete feed.posts

      //
      // Normalize the status entries.
      //
      if (feed.status instanceof Array) {
        for (let item of feed.status) {
          item.updatedAt = item.updatedAt || item.publishedAt
        }
      }

      //
      // Sort posts based on the settings.
      //
      Object.assign(meta, feed)
      meta.sortedBy = sortedBy
      meta.posts.sort((a, b) => b[sortedBy] > a[sortedBy] ? 1 : -1)
    }

    feed.fresh = fresh
    return feed
  },

  //
  // This checks for updates to a follow using the browser's fetch API.
  // One thing to mention about URLs here. In the follows.json, 'feed' is the
  // current feed location, 'url' is the home page URL, used to link to the
  // follow. But in the individual follow object, the 'originalUrl' is stored
  // as well, though it is not commonly used.
  //
  // The original link is stored in case we start getting 404s somewhere and
  // need to try the original link to track down new feed URLs. The 'feed' URL
  // is stored in the 'follow' object here because it's used to broadcast
  // not just the main URL, but the feed URL being used here.
  //
  async refetch(follow) {
    let meta = {createdAt: new Date(), originalUrl: follow.url,
      url: follow.url, feed: follow.url, posts: []}
    if (follow.id) {
      try {
        meta = await this.readFile(`/feeds/${follow.id}.json`)
      } catch (e) {}
    }

    let feed = await this.scrape(meta)
    if (!feed.fresh)
      return feed

    //
    // This is not a feed, but a list of feed sources.
    //
    if (feed.sources && feed.sources.length > 0) {
      if (feed.sources.length == 1) {
        meta.feed = feed.sources[0].url
        feed = await this.scrape(meta)
      } else {
        return feed
      }
    }

    //
    // Index a portion of the metadata. Don't need all the 'rels' and
    // 'photos' and other metadata that may come in useful later.
    //
    follow.id = urlToID(urlToNormal(meta.feed))
    follow.feed = meta.feed
    follow.url = meta.url
    follow.actualTitle = meta.title
    follow.status = meta.status
    follow.sortedBy = meta.sortedBy
    if (meta.photos)
      follow.photo = meta.photos['avatar'] || Object.values(meta.photos)[0]

    //
    // Add some posts from the other sort method, in case it is toggled.
    //
    let sortOpposite = meta.sortedBy === 'publishedAt' ? 'updatedAt' : 'publishedAt'
    let oppo = meta.posts.concat().sort((a, b) => b[sortOpposite] > a[sortOpposite] ? 1 : -1)
    follow.limit = POSTS_IN_MAIN_INDEX
    follow.posts = meta.posts.slice(0, POSTS_IN_MAIN_INDEX)
    follow.posts = follow.posts.concat(oppo.slice(0, POSTS_IN_MAIN_INDEX).
      filter(o => !follow.posts.includes(o)))

    //
    // Build the 'activity' array - most recent first, then trim
    // off empty items from the history.
    //
    let arr = [], len = 0, now = new Date()
    arr.length = ACTIVITY_IN_MAIN_INDEX 
    arr.fill(0)
    meta.posts.find(post => {
      let daysAgo = Math.floor((now - post.updatedAt) / 86400000)
      if (daysAgo >= 0 && daysAgo < ACTIVITY_IN_MAIN_INDEX)
        arr[daysAgo]++
      return daysAgo >= ACTIVITY_IN_MAIN_INDEX
    })
    for (len = ACTIVITY_IN_MAIN_INDEX - 1; len >= 0; len--) {
      if (arr[len] != 0)
        break
    }
    if (len > 0) {
      arr.splice(len + 1)
    }
    follow.activity = arr
    this.writeFile(`/feeds/${follow.id}.json`, meta)

    return feed
  },

  async fetchfeed(follow) {
    let id = follow.id || urlToID(urlToNormal(follow.url))
    this.noteUpdate([id], false)
    console.log(`Updating ${followTitle(follow)}`)
    let feed
    try {
      feed = await this.refetch(follow)
    } finally {
      this.fetched[id] =
        {at: Number(new Date()), delay: Math.ceil(50 + (Math.random() * 50))}
      this.localSet('fraidycat', {fetched: this.fetched})
      this.noteUpdate([id], true)
    }
    return feed
  },

  //
  // Saving, fetching and reading follows. I/O of any kind.
  //

  //
  // Update pieces of the follows list that have changed (from other browsers).
  //
  onSync(changes) {
    let obj = this.mergeSynced(changes, 'follows')
    this.sync(obj, SYNC_PARTIAL)
  },

  //
  // Update local follows with anything added from synced sources (other
  // browsers, other dats owned by the user) or removed as well.
  //
  // Here are the possible sync events that happen:
  // * SYNC_FULL: On startup, the sync list is read and merged with the master
  //   list. (For example, follows on other browsers may have happened on other
  //   PCs while this PC was shutdown.) Only missing follows should also be
  //   merged back - in case a sync failed previously. Or perhaps we just
  //   logged in.
  // * SYNC_PARTIAL: In the 'onSync' message above, we'll often receive
  //   partial updates. In this case, we only add updates, since we can't
  //   see the rest of the sync.
  // * SYNC_EXTERNAL: On import, everything runs through sync, since the format
  //   is the same. In this case, an outgoing sync will be forced if any changes
  //   at all are made (new entries OR missing entries) because the source is an
  //   external file, not the sync.
  //
  // See also the `write` method. When follows are added, edited or removed,
  // the changes are pushed to the sync through there.
  //
  async sync(inc, syncType) {
    let updated = false, follows = []
    // console.log(inc)
    if ('follows' in inc) {
      if ('index' in inc)
        Object.assign(this.index, inc.index)

      this.noteUpdate(Object.keys(inc.follows), false)
      for (let id in inc.follows) {
        try {
          let current = this.all[id], incoming = inc.follows[id], notify = false
          if (!(id in this.follows))
            this.follows[id] = inc.follows[id]
          if (!current || current.editedAt < incoming.editedAt) {
            if (incoming.deleted) {
              this.follows[id] = incoming
              if (current) {
                delete this.all[id]
                this.update({op: 'remove', path: `/all/${id}`})
                follows.push(id)
              }
            } else {
              if (current)
                incoming.id = id
              try {
                await this.refresh(incoming)
                if (syncType === SYNC_EXTERNAL) {
                  current = this.all[id]
                  notify = true
                }
              } catch {}
              // catch(msg => console.log(`${incoming.url} is ${msg}`))
            }
            updated = true
          } else if (current.editedAt > incoming.editedAt) {
            if (syncType !== SYNC_EXTERNAL) {
              notify = true
            }
          }

          if (notify && current) {
            follows.push(id)
            this.notifyFollow(current)
          }
        } finally {
          this.noteUpdate([id], true)
        }
      }
    }

    if (syncType === SYNC_FULL) {
      for (let id in this.all) {
        if (!inc.follows || !inc.follows[id]) {
          follows.push(id)
          this.notifyFollow(this.all[id])
        }
      }
    }

    if (updated || follows.length > 0) {
      this.write({update: follows.length > 0, follows})
    }

    if (inc.settings) {
      Object.assign(this.settings, inc.settings)
      this.update({op: 'replace', path: '/settings', value: this.settings})
    }
  },

  //
  // Notify of follow
  //
  notifyFollow(follow) {
    this.follows[follow.id] = {url: follow.feed,
      importance: follow.importance, title: follow.title, tags: follow.tags,
      fetchesContent: follow.fetchesContent, editedAt: follow.editedAt}
  },

  //
  // Import from an OPML file
  //
  async importFrom(data) {
    if (data.format == 'opml') {
      //
      // Import follows from the OPML - everything that's missing.
      //
      let follows = {}, parents = []
      let xml = sax.createStream(false, {lowercasetags: true}), currentTag = null
      xml.on('opentag', node => {
        if (node.name == 'outline') {
          let url = node.attributes.xmlurl || node.attributes.htmlurl
          if (url) {
            let tags = [], match = null, importance = 0
            if (node.attributes.category) {
              tags = node.attributes.category.split(',')
            }
            tags = tags.concat(parents).filter(tag => {
              if ((match = tag.match(/^importance\/(\d+)$/)) !== null) {
                importance = Number(match[1])
                return false
              }
              return true
            })

            if (tags.length == 0)
              tags = null
            follows[urlToID(urlToNormal(url))] =
              {url, tags, importance, title: node.attributes.title,
                editedAt: new Date(node.attributes.created)}
          }

          if (!node.isSelfClosing) {
            parents.push(node.attributes.text)
          }
        }
      }).on('closetag', name => {
        if (name == 'outline') {
          parents.pop()
        }
      })
      xml.write(data.contents)
      if (Object.keys(follows).length > 0)
        this.sync({follows}, SYNC_EXTERNAL)
    } else {

      //
      // Import all settings from a JSON file.
      //
      this.sync(this.decode(data.contents), SYNC_EXTERNAL)
    }
  },

  //
  // Export to OPML
  //
  async exportTo(msg, sender) {
    let outlines = []
    let mimeType = null, contents = null

    if (msg.format === 'opml') {
      //
      // Export follows (not all settings) to OPML.
      //
      mimeType = 'text/xml'
      for (let id in this.all) {
        let follow = this.all[id]
        let category = `importance/${follow.importance}` + 
          (follow.tags ? ',' + follow.tags.join(',') : '')
        let item = {category, created: follow.editedAt, text: followTitle(follow),
          xmlUrl: follow.feed, htmlUrl: follow.url}
        if (follow.title)
          item.title = follow.title
        outlines.push(item)
      }
      contents = og({title: "Fraidycat Follows", dateCreated: new Date()}, outlines)

    } else if (msg.format === 'html') {
      //
      // Export to HTML similar to Firefox bookmarks.
      //
      mimeType = 'text/html'
      let follows = {}, allTags = {}
      Object.values(this.all).
        sort((a, b) => followTitle(a) > followTitle(b)).
        map(follow => {
          (follow.tags || [house]).forEach(k => {
            let fk = `${k}/${follow.importance}`
            if (!follows[fk])
              follows[fk] = []
            follows[fk].push(follow)
            allTags[k] = true
          })
        })

      let tags = Object.keys(allTags).filter(t => t != house).sort()
      tags.unshift(house)

      let dl = u('<dl>')
      for (let tag of tags) {
        let dli = u('<dl>')
        for (let imp of Importances) {
          let fk = `${tag}/${imp[0]}`
          if (follows[fk]) {
            let dlr = u('<dl>')
            for (let follow of follows[fk]) {
              dlr.append(u('<dt>').append(u('<a>').attr({href: follow.url}).text(followTitle(follow))))
            }
            dli.append(u('<dt>').append(u('<h4>').text(imp[2] + " " + imp[1])).append(dlr))
          }
        }

        dl.append(u('<dt>').append(u('<h3>').text(tag)).append(dli))
      }

      contents = u('<div>').
        append(u('<meta>').attr({'Content-Type': 'text/html; charset=UTF-8'})).
        append(u('<title>').text('Fraidycat Links')).
        append(u('<h1>').text('Fraidycat Follows')).
        append(dl).html()

    } else {
      //
      // Straight JSON export of the sync file.
      //
      mimeType = 'application/json'
      contents = this.encode(this.toObject())
    }
    this.update({op: 'exported', format: msg.format, mimeType, contents}, sender)
  },

  //
  // Fetch a follow from a remote source, updating its local metadata.
  //
  async refresh(follow) {
    let savedId = !!follow.id
    if (!savedId) {
      if (!follow.url.match(/^\w+:\/\//))
        follow.url = "http://" + follow.url
      follow.createdAt = new Date()
    }
    follow.updatedAt = new Date()

    let feed = await this.fetchfeed(follow)
    if (feed.sources)
      return feed.sources
    
    if (!savedId && this.all[follow.id])
      throw `${follow.url} is already a subscription of yours.`

    this.all[follow.id] = follow
    this.update({op: 'replace', path: `/all/${follow.id}`, value: follow})
    this.notifyFollow(follow)
  },

  async save(follow, sender) {
    try {
      let feeds = await this.refresh(follow)
      if (feeds) {
        this.update({op: 'discovery', feeds, follow}, sender)
      } else {
        this.write({update: true, follows: [follow.id]})
        this.update({op: 'subscription', follow}, sender)
      }
    } catch (e) {
      console.log(e)
      this.update({op: 'error', message: e}, sender)
    }
  },

  //
  // Subscribe to (possibly) several from a list of feeds for a site.
  //
  async subscribe(fc, sender) {
    // console.log(fc)
    let site = fc.site, list = fc.list, follows = []
    let sel = list.filter(feed => feed.selected), errors = []
    for (let feed of sel) {
      let follow = {url: feed.url, importance: site.importance,
        tags: site.tags, title: site.title, editedAt: new Date()}
      if (sel.length > 1) {
        follow.title = `${followTitle(site)} [${feed.title}]`
      }

      try {
        let feeds = await this.refresh(follow)
        if (feeds) {
          errors.push(`${follow.url} is not a feed.`)
        } else {
          follows.push(follow.id)
        }
      } catch (msg) {
        errors.push(msg)
      }
    }
    if (follows.length > 0)
      this.write({update: true, follows})
    if (errors.length > 0) {
      this.update({op: 'error', message: errors.join("\n")}, sender)
    } else {
      this.update({op: 'subscription', follow: site}, sender)
    }
  },

  //
  // Write the master list (and the sync list, possibly) to disk.
  //
  async write(opts) {
    this.writeFile('/follows.json', this.all).then(() => {
      if (opts.update) {
        this.writeSynced(this.toObject(), 'follows', opts.follows)
      }
    })
  },

  //
  // Write changes to settings.
  //
  async changeSetting(s) {
    let val = this.settings[s.name]
    if (s.name.startsWith('mode-')) {
      val = val ? null : s.value
    } else if (s.name.startsWith('sort-')) {
      val = s.value
    }
    this.settings[s.name] = val
    this.update({op: 'replace', path: `/settings`, value: this.settings})
    return this.writeSynced({settings: this.settings})
  },

  //
  // Remove a follow.
  //
  async remove(follow, sender) {
    delete this.all[follow.id]
    this.follows[follow.id] = {deleted: true, editedAt: new Date()}
    this.update({op: 'remove', path: `/all/${follow.id}`})
    this.write({update: true, follows: [follow.id]})
    this.update({op: 'subscription', follow}, sender)
    this.deleteFile(`/feeds/${follow.id}.json`)
  }
}
