//
// src/js/storage.js
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
// * Synced metadata. Lists all inputted metadata for a
//   follow.
//
// The synced metadata is very minimal - it's up to the local Fraidycat
// instance to pull down feeds and operate independently. This allows the
// instance to run alone, with no syncing, should the user want it that way.
//
import { followTitle, house, Importances } from './util'
import feedycat from './feedycat'
import u from '@kickscondor/umbrellajs'

const og = require('opml-generator')
const quicklru = require('quick-lru')
const sax = require('sax')
const url = require('url')

function fetchedAt(fetched, id) {
  let fetch = fetched[id]
  return fetch ? fetch.at : 0
}

function isOutOfDate(follow, fetched) {
  let imp = Number(follow.importance)
  let age = (new Date()) - (fetchedAt(fetched, follow.id) || 0)
  if (fetched[follow.id])
    age *= (fetched[follow.id].delay || 1.0)
  if (imp < 1) {
    // Real-time is currently a five minute check.
    return age > (5 * 60 * 1000)
  } else if (imp < 2) {
    // Daily check is hourly.
    return age > (60 * 60 * 1000)
  } else {
    // Longer checks are once or twice a day.
    return age > (12 * 60 * 60 * 1000)
  }
}

module.exports = {
  setup(msg, sender) {
    let obj = {started: true}
    Object.assign(this, {all: {}, updating: [], fetched: {},
      common: {settings: {broadcast: false}, follows: {}, index: {}, maxIndex: 0},
      postCache: new quicklru({maxSize: 1000})})

    this.readFile('/follows.json').
      then(all => obj.all = all).catch(e => console.log(e)).
      finally(() => {
        this.localGet('fraidycat').then(saved => {
          if (saved)
            Object.assign(this, saved)
          Object.assign(this, obj)
          this.update(obj, sender)
          this.readSynced('follows').
            then(inc => this.sync(inc, true)).
            catch(e => console.log(e)).
            finally(_ => setInterval(() => this.poll(), 200))
        })
      })
  },

  //
  // Store metadata about last fetch, last caching data for a follow.
  //
  markFetched(follow) {
    if (follow.response) {
      this.fetched[follow.id] = Object.assign(follow.response,
        {at: new Date(), delay: 0.5 + (Math.random() * 0.5)})
      this.localSet('fraidycat', {fetched: this.fetched})
      delete follow.response
    }
  },

  //
  // Periodically update a follow.
  //
  async poll() {
    let qual = Object.values(this.all).
      filter(follow => !this.updating.includes(follow) && isOutOfDate(follow, this.fetched))
    if (qual.length > 0) {
      let oldest = qual.reduce((old, follow) =>
        (fetchedAt(this.fetched, old.id) || 0) > (fetchedAt(this.fetched, follow.id) || 0) ? follow : old)
      if (oldest) {
        let lastFetch = this.fetched[oldest.id]
        this.updating.push(oldest)
        console.log(`Updating ${followTitle(oldest)}`)
        await feedycat(this, oldest, lastFetch)
        this.markFetched(oldest)
        this.updating = this.updating.filter(follow => follow != oldest)
        if (lastFetch.status != 304) {
          this.update({op: 'replace', path: `/all/${oldest.id}`, value: oldest})
          this.write({update: false, follows: [oldest.id]})
        }
      }
    }
  },

  //
  // Saving, fetching and reading follows. I/O of any kind.
  //

  //
  // Update pieces of the follows list that have changed (from other browsers).
  //
  onSync(changes) {
    if (changes.id[0] !== this.id) {
      let obj = this.mergeSynced(changes, 'follows')
      this.sync(obj)
    }
  },

  //
  // Update local follows with anything added from synced sources (other
  // browsers, other dats owned by the user) or removed as well.
  //
  async sync(inc, updateSettings) {
    let updated = false, follows = []
    if ('follows' in inc) {
      if ('index' in inc)
        Object.assign(this.common.index, inc.index)

      for (let id in inc.follows) {
        let current = this.all[id], incoming = inc.follows[id]
        if (!(id in this.common.follows))
          this.common.follows[id] = inc.follows[id]
        if (!current || current.editedAt < incoming.editedAt) {
          if (incoming.deleted) {
            if (current) {
              delete this.all[id]
              this.update({op: 'remove', path: `/all/${id}`})
            }
          } else {
            if (current)
              incoming.id = id
            await this.refresh(incoming).
              catch(msg => console.log(`${incoming.url} is ${msg}`))
          }
          follows.push(id)
          updated = true
        }
      }
    }

    if (updateSettings) {
      for (let id in this.all) {
        if (!inc.follows || !inc.follows[id]) {
          this.notifyFollow(this.all[id])
          follows.push(id)
        }
      }
    }

    if (updated || updateSettings) {
      this.write({update: updateSettings, follows})
    }

    if ('settings' in inc) {
      Object.assign(this.common.settings, inc.settings)
    }
  },

  //
  // Get all posts from a given follow.
  //
  getPosts(id) {
    let posts = this.postCache.get(id)
    //this.set({posts: posts})
    if (posts == null) {
      this.postCache.set(id, [])
      this.readFile(`/feeds/${id}.json`).then(meta => {
        this.postCache.set(id, meta.posts)
        //this.set({posts: meta.posts})
      }, err => {})
    }
  },

  //
  // Get full post contents from a follow.
  //
  getPostDetails(id, post) {
    if (post) {
      let fullId = `${id}/${post.publishedAt.getFullYear()}/${post.id}`
      let deets = this.postCache.get(fullId)
      //this.set({post: deets})
      if (deets == null) {
        this.postCache.set(fullId, {})
        this.readFile(`/feeds/${fullId}.json`).then(obj => {
          this.postCache.set(fullId, obj)
          //this.set({post: obj})
        }, err => {})
      }
    }
  },

  //
  // Notify of follow
  //
  notifyFollow(follow) {
    this.common.follows[follow.id] = {url: follow.feed, tags: follow.tags,
      importance: follow.importance, title: follow.title,
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
      let follows = [], parents = []
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

            follows.push({url, tags, importance, title: node.attributes.title,
              editedAt: new Date(node.attributes.created)})
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
      if (follows.length > 0)
        this.sync({follows}, true)
    } else {

      //
      // Import all settings from a JSON file.
      //
      this.sync(this.decode(data.contents), true)
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
            dli.append(u('<dt>').append(u('<h4>').text(imp[1])).append(dlr))
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
      contents = this.encode(this.common)
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

    let feeds = await feedycat(this, follow)
    if (feeds)
      return feeds
    
    if (!savedId && this.all[follow.id])
      throw `${follow.url} is already a subscription of yours.`

    this.markFetched(follow)
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
      let follow = {url: feed.href, importance: site.importance,
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
        this.writeSynced('follows', opts.follows, this.common)
      }
    })
  },

  //
  // Remove a follow.
  //
  async remove(follow, sender) {
    delete this.all[follow.id]
    this.common.follows[follow.id] = {deleted: true, editedAt: new Date()}
    this.update({op: 'remove', path: `/all/${follow.id}`})
    this.write({update: true, follows: [follow.id]})
    this.update({op: 'subscription', follow}, sender)
  },
}
