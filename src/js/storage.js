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
import { followTitle, house, html2text, getIndexById, Importances,
  urlToFeed, urlToID, urlToNormal, isValidFollow } from './util'
import u from '@kickscondor/umbrellajs'

const fraidyscrape = require('fraidyscrape')
const og = require('opml-generator')
const frago = require('./frago')
const url = require('url')

const SYNC_FULL = 1
const SYNC_PARTIAL = 2
const SYNC_EXTERNAL = 3

const FETCH_FORCE = 1
const FETCH_SILENT = 2

const POSTS_IN_MAIN_INDEX = 10
const ACTIVITY_IN_MAIN_INDEX = 180

import rules from '../../defs/social.json'

function ConflictError(message) {
  this.message = message
  this.name = 'ConflictError'
}

function fetchedAt(fetched, id) {
  let fetch = fetched[id]
  return fetch ? fetch.at : 0
}

function isOutOfDate(follow, fetched) {
  let imp = Number(follow.importance)
  let age = (new Date()) - (fetchedAt(fetched, follow.id) || 0)
  if (fetched[follow.id])
    age += age * Math.ceil(fetched[follow.id].delay || 100) * 0.01
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

    Object.assign(this, {fetched: {}, follows: {}, index: {}})

    //
    // Update the scraping rules once an hour.
    //
    let pollFreq = 3000, pollDate = new Date(0), pollMod = "none"
    let fetchScraper = async () => {
      let now = new Date()
      if (now - pollDate > (60 * 60 * 1000)) {
        let mod, defs
        pollDate = now

        try {
          let soc = await this.fetch("https://fraidyc.at/defs/social.json")
          mod = soc.headers.get('last-modified')
          if (pollMod !== mod) {
            let txt = await soc.text()
            defs = JSON.parse(txt)
          }
        } catch {
          if (!this.scraper) {
            let obj
            try { obj = await this.readFile('/social.json') } catch {}
            if (obj && obj.mod && obj.defs) {
              mod = obj.mod
              defs = obj.defs
            } else {
              mod = "built-in"
              defs = rules
            }
          }
        }

        if (defs) {
          if (pollMod !== mod) {
            this.scraper = new fraidyscrape(defs, this.dom, this.xpath)
            pollMod = mod
            this.writeFile('/social.json', {defs, mod})
          }
        }
      }
    }

    let pollFn = () => {
      this.poll()
      fetchScraper()
      setTimeout(pollFn, pollFreq)
    }

    //
    // Load the follows and various application states.
    //
    let saved = null, inc = {}
    try {
      //
      // Bit of backwards compatibility - some older files may have
      // conflicting IDs (dict key vs. the object's property)
      //
      let all = {}, allf = await this.readFile('/follows.json')
      for (let follow of allf) {
        if (follow.id) {
          all[follow.id] = follow
        }
      }
      obj.all = all
    } catch {}
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
    let maxToQueue = 8
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

      this.pollfetch(follow)
      maxToQueue--
    }
  },

  pollfetch(follow) {
    this.fetchfeed(follow, 0).then(feed => {
      if (feed.fresh) {
        this.update({op: 'replace', path: `/all/${follow.id}`, value: follow})
        this.write({update: false})
      }
    }).catch(console.log)
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
  async scrapeFeed(url, defaultOnly = false) {
    if (!url) {
      return {err: "This follow has no feed URL."}
    }

    let req, feed, err, tasks = this.scraper.detect(url)
    if (defaultOnly && tasks?.queue?.length > 0 && tasks.queue[0] !== "default") {
      return {feed, err}
    }

    while (req = this.scraper.nextRequest(tasks)) {
      // console.log(req)
      try {
        let obj
        if (req.render) {
          obj = await this.render(req, tasks)
        } else {
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
            // console.log(`${req.url} is giving a ${res.status} error.`)
            err = `${req.url} is giving a ${res.status} error.`
          }

          obj = await this.scraper.scrape(tasks, req, res)

          if (obj.out && res.headers) {
            obj.out.etag = res.headers.get('etag')
              || res.headers.get('last-modified')
              || res.headers.get('date')
          }
        }

        feed = obj.out
      } catch (e) {
        err = e.message
        if (err === "Failed to fetch")
          err = "Couldn't connect - check your spelling, be sure this URL really exists."
        break
      }
    }

    if (!err && !feed) {
      err = "This follow is temporarily down."
    }

    return {feed, err}
  },

  async scrape(meta, flags) {
    let {feed, err} = await this.scrapeFeed(meta.feed)
    if (err != null && (flags & FETCH_SILENT) == 0)
      throw err

    //
    // Merge the new posts into the feed's master post list.
    //
    let fresh = ((flags & FETCH_FORCE) != 0 || !feed.etag || feed.etag !== meta.etag)
    // if (!fresh) {
    //   console.log(`${meta.feed} hasn't changed.`)
    // }
    if (fresh && feed.posts) {
      //
      // If all entries have identical titles, use the descriptions.
      //
      let ident = 0
      if (feed.posts.length > 1) {
        let oldestDate = new Date(), urls = {}
        let firstTitle = feed.posts[0].title
        let ident = feed.posts.filter(item => {
          let at = item.updatedAt || item.publishedAt
          if (at && oldestDate > at)
            oldestDate = at
          urls[item.url] = at
          return firstTitle && item.title === firstTitle
        }).length

        if (ident != feed.posts.length)
          ident = 0

        //
        // Remove any posts that are within the feed's timestamps,
        // but which aren't listed.
        //
        meta.posts = meta.posts.filter(item =>
          !((item.updatedAt > oldestDate) && !urls[item.url]))
      }
 
      //
      // Normalize the post entries for display.
      //
      let posts = []
      for (let item of feed.posts) {
        let now = new Date()
        if (typeof(item.url) !== 'string' ||
          (item.publishedAt && item.publishedAt > now))
          continue
        let i = getIndexById(meta.posts, item.url, 'url'), index = null
        if (i < 0) {
          index = {id: urlToID(urlToNormal(item.url)), url: item.url, createdAt: now}
          if (feed.flags !== 'COMPLETE') {
            meta.posts.unshift(index)
          }
        } else {
          index = meta.posts[i]
        }
        if (feed.flags === 'COMPLETE') {
          posts.push(index)
        }

        if (item.publishedAt && index.publishedAt) {
          //
          // If this is an older version of a post, backdate it and leave.
          // Or, if it's a newer version, convert it into an update.
          //
          if (item.publishedAt < index.publishedAt) {
            index.publishedAt = item.publishedAt
            continue
          }
          if (item.publishedAt > index.publishedAt && !item.updatedAt) {
            item.updatedAt = item.publishedAt
            delete item.publishedAt
          }
        }

        let title = (ident === 0 && item.title) || item.text
        if (title)
          index.title = title
        if (!index.title && item.html)
          index.title = html2text(item.html)
        if (!index.title && item.publishedAt)
          index.title = item.publishedAt.toLocaleString()
        if (!index.title && ident !== 0)
          index.title = item.title
        if (!index.title)
          index.title = "..."
        if (feed.sortBy && item[feed.sortBy])
          index[feed.sortBy] = item[feed.sortBy]
        index.author = item.author
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
          if (!item.text && item.html) {
            item.text = html2text(item.html)
            delete item.html
          }
        }
      }

      //
      // Sort posts based on the settings.
      //
      delete meta.sortBy
      Object.assign(meta, feed)
      frago.sort(meta, feed.sortBy || this.settings['mode-updates'] || 'publishedAt',
        this.settings['mode-reposts'] !== 'hide', true)
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
  async refetch(id, follow, flags) {
    let meta = {createdAt: new Date(),
      url: follow.url, feed: follow.feed || follow.url, posts: []}
    if (follow.id) {
      try {
        meta = await this.readFile(`/feeds/${follow.id}.json`)
        if (follow.url !== meta.url)
          flags |= FETCH_FORCE
      } catch (e) {}
    }

    let feed = await this.scrape(meta, flags)
    if (!feed.fresh)
      return feed

    //
    // This is not a feed, but a list of feed sources.
    //
    if (feed.sources && feed.sources.length > 0) {
      if (feed.sources.length == 1) {
        meta.feed = feed.sources[0].url
        feed = await this.scrape(meta, flags)
      } else {
        return feed
      }
    }

    //
    // Index a portion of the metadata. Don't need all the 'rels' and
    // 'photos' and other metadata that may come in useful later.
    //
    if (!follow.originalUrl)
      follow.originalUrl = meta.originalUrl || follow.url
    follow.id = id
    follow.feed = meta.feed
    follow.url = meta.url
    follow.actualTitle = meta.title
    follow.status = meta.status
    follow.author = meta.author
    if (meta.photos)
      follow.photo = meta.photos['avatar'] || Object.values(meta.photos)[0]

    //
    // Select the top posts for every possible sort method, to give us a limited
    // index of the posts that each filter method would select.
    //
    follow.actualLimit = follow.limit ?? POSTS_IN_MAIN_INDEX
    follow.posts = frago.master(meta,
      meta.sortBy ? [meta.sortBy] : ['publishedAt', 'updatedAt'],
      follow.actualLimit)
    follow.sortedBy = meta.sortedBy

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

  //
  // ID is generated once, based on the feed URL. However, this doesn't stay
  // in sync as the feed URL changes. This ensures that changes don't litter
  // the sync files with deleted old URLs. Also, if the hashing algorithm changes,
  // we don't need to recompute all the hashes necessarily.
  //
  async fetchfeed(follow, flags) {
    let id = follow.id || urlToID(urlToNormal(follow.url))
    this.noteUpdate([id], false)
    // console.log(`Updating ${followTitle(follow)}`)
    let feed
    try {
      feed = await this.refetch(id, follow, flags)
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

  onRender(url) {
    this.scraper.lookupWatch(url, async (r, tasks) => {
      let res = await fetch(url)
      try { await this.scraper.scrapeRule(tasks, res, r) } catch {}
    })
  },

  async urlDetails(url) {
    let found = -1, id = urlToID(urlToNormal(url))
    if (!(id in this.all)) {
      found = 0
      try {
        let {feed, err} = await this.scrapeFeed(url, true)
        if (!err) {
          if (feed?.sources) {
            found = feed.sources.some(feed => feed.type) ? 1 : 0
          } else {
            found = 1
          }
        }
        return {found, feed}
      } catch (e) {
        console.log(e)
      }
    }

    return {found}
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

      let ids = Object.keys(inc.follows)
      this.noteUpdate(ids, false)
      for (let id of ids) {
        try {
          let current = this.all[id], incoming = inc.follows[id], notify = false
          if (incoming.url) {
            if (!(id.match && id.match(/-[0-9a-f]{1,8}$/))) {
              id = urlToID(urlToNormal(incoming.url))
            }
            if (!(id in this.follows))
              this.follows[id] = incoming
            if (!current || current.editedAt < incoming.editedAt || !isValidFollow(current)) {
              if (incoming.deleted) {
                this.follows[id] = incoming
                if (current) {
                  delete this.all[id]
                  this.update({op: 'remove', path: `/all/${id}`})
                  this.deleteFile(`/feeds/${id}.json`)
                  follows.push(id)
                }
              } else {
                try {
                  incoming.id = id
                  await this.refresh(incoming, FETCH_SILENT)
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
          }
        } finally {
          this.noteUpdate([id], true)
        }
      }
    }

    if (syncType === SYNC_FULL) {
      for (let id in this.all) {
        if (!this.follows[id]) {
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
  notifyFollow(follow, updateLocal = false) {
    if (updateLocal) {
      this.all[follow.id] = follow
      this.update({op: 'replace', path: `/all/${follow.id}`, value: follow})
    }
    this.follows[follow.id] = {url: follow.originalUrl || follow.feed,
      importance: follow.importance, title: follow.title, tags: follow.tags,
      fetchesContent: follow.fetchesContent, editedAt: follow.editedAt,
      limit: follow.limit}
  },

  //
  // Rename a tag
  //
  rename(tag) {
    if (tag.to instanceof String && tag.from instanceof String) {
      let follows = []
      for (let id in this.all) {
        let follow = this.all[id]
        if (follow.tags) {
          let index = follow.tags.indexOf(tag.from)
          if (index >= 0) {
            follow.tags[index] = tag.to
            follows.push(follow.id)
            this.notifyFollow(follow, true)
          }
        }
      }

      if (follows.length > 0) {
        this.write({update: true, follows})
      }
    }
  },

  //
  // Import from an OPML file
  //
  async importFrom(data) {
    if (data.format == 'opml') {
      //
      // Import follows from the OPML - everything that's missing.
      //
      let follows = {}
      let doc = this.dom(data.contents, 'text/xml')
      let list = this.xpath(doc, doc, '//body/outline')
      this.importList(doc, list, [], 0, follows)
      if (Object.keys(follows).length > 0) {
        this.sync({follows}, SYNC_EXTERNAL)
      }
    } else {
      //
      // Import all settings from a JSON file.
      //
      this.sync(this.decode(data.contents), SYNC_EXTERNAL)
    }
  },

  importList(doc, list, parents, importance, follows) {
    for (let i = 0; i < list.length; i++) {
      let node = list[i], tags = parents.concat(), match = null
      let url = node.attributes.xmlUrl || node.attributes.htmlUrl
      let title = node.attributes.title || node.attributes.text
      if (url)
        url = url.value
      if (!url && node.attributes.text)
        tags.push(node.attributes.text.value)
      if (node.attributes.category) {
        tags = tags.concat(node.attributes.category.value.split(','))
      }
      tags = tags.filter(tag => {
        if ((match = tag.match(/^importance\/(\d+)$/)) !== null) {
          importance = Number(match[1])
          return false
        }
        return true
      })

      let children = this.xpath(doc, node, './outline')
      this.importList(doc, children, tags, importance, follows)

      if (url) {
        if (tags.length == 0)
          tags = null
        follows[urlToID(urlToNormal(url))] =
          {url, tags, importance,
            title: title && title.value,
            editedAt: node.attributes.created ? new Date(node.attributes.created.value) : new Date()}
      }
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
  async refresh(follow, flags) {
    let savedId = !!follow.id
    if (!savedId) {
      if (!follow.url.match(/^\w+:\/\//))
        follow.url = "http://" + follow.url
    }
    if (!follow.createdAt) {
      follow.createdAt = follow.editedAt || new Date()
    }
    follow.updatedAt = new Date()

    let feed = await this.fetchfeed(follow, flags | FETCH_FORCE)
    if (feed.sources) {
      if (feed.sources.length === 0) {
        if ((flags & FETCH_SILENT) == 0) {
          throw "Cannot find an RSS feed or social media account to follow at this URL."
        }
      } else {
        return feed.sources
      }
    }
    
    if (!savedId) {
      let found = false
      for (let id in this.all)
        if (id === follow.id || this.all[id].feed === follow.feed)
          throw new ConflictError(`${follow.feed} is already a subscription of yours.`)
    }

    this.notifyFollow(follow, true)
  },

  async save(follow, sender) {
    let feeds = null
    try {
      feeds = await this.refresh(follow, follow.force ? FETCH_SILENT : 0)
    } catch (e) {
      // console.log(e)
      if (e.name === 'ConflictError' || !follow.force) {
        if (e.name === 'ConflictError')
          follow = null
        if (e.message)
          e = e.message
        this.update({op: 'error', follow, message: e}, sender)
        return
      }
    }

    if (feeds) {
      this.update({op: 'discovery', feeds, follow}, sender)
    } else {
      this.write({update: true, follows: [follow.id]})
      this.update({op: 'subscription', follow}, sender)
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
        let feeds = await this.refresh(follow, 0)
        if (feeds) {
          errors.push(`${follow.url} is not a feed.`)
        } else {
          follows.push(follow.id)
        }
      } catch (msg) {
        if (msg.message)
          msg = msg.message
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
    } else {
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
