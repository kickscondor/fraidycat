import { urlToID, urlToNormal } from './util'
import { jsonDateParser } from "json-date-parser"
import u from 'umbrellajs'

const normalizeUrl = require('normalize-url')
const feedme = require('feedme')
const sax = require('sax')
const url = require('url')

const POSTS_IN_MAIN_INDEX = 5
const ACTIVITY_IN_MAIN_INDEX = 180

function normalizeFeedUrl(abs, href) {
  return normalizeUrl(url.resolve(abs, href), {stripWWW: false, stripHash: true, removeTrailingSlash: false})
}

async function readLoop(parser, reader, startTag, firstChunk) {
  let chunk = null
  try {
    let decoder = new TextDecoder()
    if (startTag)
      parser.write(startTag)
    if (firstChunk)
      parser.write(firstChunk)
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      chunk = decoder.decode(value)
      parser.write(chunk)
    }
    return null
  } catch (e) {
    return chunk
  }
}

function add_post(storage, meta, follow, item_url, item, now) {
  let i = 0, index = null
  let item_id = item_url.replace(/^[a-z]+:\/+[^\/]+\/+/, '').replace(/\W+/g, '_')
  let item_stub = `${item.publishedAt.getFullYear()}/${item_id}`

  for (i = 0; i < meta.posts.length; i++) {
    index = meta.posts[i]
    if (index.id == item_id) {
      // if (index.guid != item.guid)
      //   item.updatedAt = now
      i = -1
      break
    }
    if (index.publishedAt <= item.publishedAt)
      break
  }

  if (i >= 0) {
    index = {id: item_id, url: item_url, createdAt: now}
    meta.posts.splice(i, 0, index)
  }
  index.title = u("<div>").html((item.title || "").toString().trim() || item.description).text()
  index.publishedAt = item.publishedAt
  index.updatedAt = item.updatedAt
  
  storage.user.writeFile(`/feeds/${follow.id}/${item_stub}.json`, item)
}

//
// Since URLs can be for either the home page or for a
// specific feed, we go through a bit of a process:
//
// 1. If the URL is a home page, we rip the feed list
//    off of it---and, if there are multiple feeds, the
//    user is provided with a list to select from. (Also,
//    matching rel-me's are added to this list.)
// 2. For each feed selected, the 'url' to the HTML
//    version is discovered from the feed. THe 'feed' URL
//    is set and the 'id' is generated from the 'feed' URL.
// 3. Feed data is kept in several places:
//    * Post original is kept at 'feeds/{feed.id}/{post.year}/{post.id}'.
//    * An index of all posts is kept at 'feeds/{feed.id}.json'.
//    * A summary is kept in the hash at 'follows.json'.
//
async function rss(storage, meta, follow, res) {
  let reader = res.body.getReader()
  let parser = new feedme()
  let now = new Date()

  parser.on('link', (link) => {
    if (typeof(link) === 'object' && link.rel === 'avatar') {
      meta.photo = url.resolve(meta.feed, link.href)
      return
    }
    link = feedme_find(link, 'href', {type: 'text/html'})
    if (link)
      meta.url = url.resolve(meta.feed, link)
  })
  parser.on('home_page_url', link => meta.url = url.resolve(meta.feed, link))
  parser.on('title', (title) => meta.title = title)
  parser.on('description', (desc) => meta.description = desc)
  parser.on('subtitle', (desc) => meta.description = desc)
  let item_func = item => {
    let item_url = url.resolve(meta.feed, feedme_find(item.url || item.link || item.id || item.guid, 'href',
      {rel: 'alternate', type: 'text/html'}))
    item.publishedAt = new Date(item.date_published || item.pubdate || item.published || item['dc:date'])
    item.updatedAt = new Date(item.date_modified || item.updated || item.date_published || item.pubdate || item.published || item['dc:date'])
    add_post(storage, meta, follow, item_url, item, now)
  }
  parser.on('entry', item_func)
  parser.on('item', item_func)

  let chunk = await readLoop(parser, reader)
  if (!chunk) {
    parser.close()
  } else {
    //
    // Attempt to parse as HTML, to discover the feed.
    //
    let xml = sax.createStream(false, {lowercasetags: true}),
        feeds = [], maybeFeeds = [], lastName = null, lastHref = null
    xml.on('text', text => {
      if (text && lastName == 'title') {
        follow.actualTitle = text.trim()
        lastName = null
      } else if (lastName == 'a') {
        if (`${lastHref} ${text}`.match(/rss|feed/i)) {
          maybeFeeds.push({href: lastHref, title: text})
        }
      }
    }).on('opentag', node => {
      lastName = node.name
      if (lastName == 'link') {
        let rel = node.attributes['rel'], type = node.attributes['type']
        if (rel == 'alternate' && type && type.match(/xml|json/i)) {
          let title = node.attributes['title'] || "Feed"
          switch (node.attributes['type']) {
            case 'application/rss+xml':
              if (!title.match(/rss/i))
                title += " (RSS)"
              break
            case 'application/atom+xml':
              if (!title.match(/atom/i))
                title += " (Atom)"
              break
            case 'application/json':
              if (!title.match(/json/i))
                title += " (JSON)"
              break
            default:
              return
          }
          feeds.push({title, href: node.attributes['href']})
        } else if (node.attributes['sizes'] == '16x16') {
          meta.photo = node.attributes['href']
        } else if (rel && rel.match(/icon/i) && !rel.match(/mask/i) && !meta.photo) {
          meta.photo = node.attributes['href']
        }
      } else if (lastName == 'a') {
        lastHref = node.attributes['href']
      }
    }).on('closetag', node => lastName = null)
    await readLoop(xml, reader, '<root>', chunk)
    console.log(feeds, maybeFeeds)
    if (feeds.length == 0) feeds = maybeFeeds
    if (feeds.length == 1) {
      meta.feed = normalizeFeedUrl(meta.feed, feeds[0].href)
      return await feedme_get(storage, meta, follow)
    }
    return feeds
  }
}

async function twitter(storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(await res.text())
  meta.title = doc.find('title').text()
  meta.photo = doc.find('img.ProfileAvatar-image').attr('src')
  meta.description = doc.find('p.ProfileHeaderCard-bio').html()
  doc.find('div.tweet').each(tweet => { tweet = u(tweet)
    let item_url = url.resolve(meta.feed, tweet.attr('data-permalink-path').toString())
    let item_time = new Date(tweet.find('span[data-time]').attr('data-time') * 1000)
    let item = {description: tweet.find('p.tweet-text').html(),
      publishedAt: item_time, updatedAt: item_time}
    add_post(storage, meta, follow, item_url, item, now)
  })
}

async function instagram(storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(await res.text())
  meta.title = doc.find('title').text().trim()
  doc.find('script').each(script => {
    let scr = script.innerText.match(/([^{]+?({.*profile_pic_url.*})[^}]+?)/)
    if (scr) {
      let data = JSON.parse(scr[2])['entry_data']['ProfilePage'][0]['graphql']['user']
      meta.description = data.biography
      meta.photo = data.profile_pic_url
      data.edge_owner_to_timeline_media.edges.forEach(obj => {
        let item = obj.node
        let item_url = meta.feed + '/p/' + item.shortcode
        let item_time = new Date(item.taken_at_timestamp * 1000)
        let edge = item.edge_media_to_caption.edges[0]
        item.description = edge ? edge.node.text : item.accessibility_caption
        item.publishedAt = item_time
        item.updatedAt = item_time
        add_post(storage, meta, follow, item_url, item, now)
      })
    }
  })
}

function feedme_find(obj, key, where) {
  if (typeof(obj) === 'string')
    return obj
  let text = obj.text
  if (!obj.find)
    obj = [obj]
  obj = obj.find(x => Object.keys(where).every(k => x[k] === where[k]))
  return obj ? obj[key] : text
}

async function feedme_get(fn, storage, meta, follow) {
  let now = new Date()
  let res = await experimental.globalFetch(meta.feed), feeds = null
  if (res.status >= 300 && res.status < 400) {
    meta.feed = normalizeFeedUrl(meta.feed, res.headers.get('Location'))
    return await feedme_get(fn, storage, meta, follow)
  }

  follow.status = meta.status = res.status
  if (res.ok) {
    feeds = await fn(storage, meta, follow, res)
    if (feeds)
      return feeds

    follow.url = meta.url
    follow.actualTitle = meta.title
    follow.posts = meta.posts.slice(0, POSTS_IN_MAIN_INDEX)
  }

  //
  // Build the 'activity' array - most recent first, then trim
  // off empty items from the history.
  let arr = [], len = 0
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
  storage.user.writeFile(`/feeds/${follow.id}.json`, meta)
}

async function meta_get(storage, follow) {
  try {
    let data = await storage.user.readFile(`/feeds/${follow.id}.json`)
    return JSON.parse(data, jsonDateParser)
  } catch (e) {
    return {createdAt: new Date(), url: follow.url, posts: []}
  }
}

export default async (storage, follow) => {
  let meta = await meta_get(storage, follow)
  let url = urlToNormal(meta.url), match = null
  if (!meta.feed) {
    meta.feed = follow.url
    if ((match = url.match(/^pinboard\.in\/([^?]+)/)) !== null)
      meta.feed = `http://feeds.pinboard.in/rss/${match[1]}`
  }
  if (url.startsWith('twitter.com/')) {
    return await feedme_get(twitter, storage, meta, follow)
  } else if (url.startsWith('instagram.com/')) {
    return await feedme_get(instagram, storage, meta, follow)
  } else if (url.startsWith('youtube.com/')) {
    return
  } else if (url.startsWith('reddit.com/')) {
    return
  } else if (url.startsWith('soundcloud.com/')) {
    return
  }
  return await feedme_get(rss, storage, meta, follow)
}
