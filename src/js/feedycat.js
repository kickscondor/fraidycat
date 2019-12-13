//
// My feed parser, based on the 'feedme' module. Feedme generally works well,
// however, the API is kind of a mess. I like that it uses the streaming SAX
// parser underneath - to prevent stalling under the hood. But the code to
// parse RSS below is pretty gnarly. I think if I could improve feedme, I would
// have it fire common events for Atom, RSS and JSON Feed.
//
import { getIndexById, urlToID, urlToNormal } from './util'
import u from '@kickscondor/umbrellajs'

const elasticlunr = require('@kickscondor/elasticlunr')
const normalizeUrl = require('normalize-url')
const feedme = require('feedme')
const sax = require('sax')
const url = require('url')

const POSTS_IN_MAIN_INDEX = 10
const ACTIVITY_IN_MAIN_INDEX = 180

const PLAIN_HTML = 0
const TIDDLYWIKI = 1

//
// Some utility functions.
//
function normalizeFeedUrl(abs, href) {
  return normalizeUrl(url.resolve(abs, href), {stripWWW: false, stripHash: true, removeTrailingSlash: false})
}

function twDate(str) {
  return new Date(str.slice(0,4) + "-" + str.slice(4,6) + "-" + str.slice(6,8) +
    " " + str.slice(8,10) + ":" + str.slice(10,12) + ":" + str.slice(12,14) + "Z")
}

function add_photo(obj, key, val) {
  if (!obj.photos) obj.photos = {}
  obj.photos[key] = val
}

//
// Add a post to the blog's master index (/feeds/{follow.id}.json) and to the
// full post content (in the case that we're fetching all content) which is
// at /feeds/{follow.id}/{item.id}.json.
//
function add_post(storage, meta, follow, item_url, item, now) {
  let item_id = item_url.replace(/^([a-z]+:\/+[^\/#]+)?[\/#]*/, '').replace(/\W+/g, '_')
  let item_stub = `${item.publishedAt.getFullYear()}/${item_id}`
  let i = getIndexById(meta.posts, item_id), index = null
  if (i < 0) {
    index = {id: item_id, url: item_url, createdAt: now}
    meta.posts.unshift(index)
  } else {
    index = meta.posts[i]
  }
  index.title = u("<div>" + ((item.title || "").toString().trim() || (item.description || "Untitled"))).text()
  index.publishedAt = item.publishedAt
  index.updatedAt = item.updatedAt
  meta.posts.sort((a, b) => b.updatedAt - a.updatedAt)
  
  if (follow.fetchesContent)
    storage.writeFile(`/feeds/${follow.id}/${item_stub}.json`, item)
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
async function rss(options, storage, meta, follow, res) {
  let parser = new feedme()
  let now = new Date()
  let linkTags = []

  parser.on('link', (link) => {
    if (typeof(link) === 'object') {
      if (link.rel === 'avatar') {
        add_photo(meta, link.rel, url.resolve(meta.feed, link.href))
        return
      }
    }
    if (link.rel !== 'self')
      linkTags.push(link)
  })
  parser.on('favicon', (src) => add_photo(meta, 'favicon', url.resolve(meta.feed, src)))
  parser.on('image', (img) => add_photo(meta, 'avatar', url.resolve(meta.feed, img.url)))
  parser.on('home_page_url', link => meta.url = url.resolve(meta.feed, link))
  parser.on('title', (title) => meta.title = title)
  parser.on('description', (desc) => meta.description = desc)
  parser.on('subtitle', (desc) => meta.description = desc)
  let item_func = item => {
    let link = item.url || item.link || item.id || item.guid
    let item_url = url.resolve(meta.feed, feedme_find(link, 'href', [['rel', 'alternate'], ['type', 'text/html']]))
    let publishedStr = item.date_published || item.pubdate || item.published || item['dc:date']
    let updatedStr = item.date_modified || item.updated
    item.updatedAt = new Date(updatedStr || publishedStr)
    item.publishedAt = new Date(publishedStr || updatedStr)
    if (options.ignoreUpdated)
      item.updatedAt = item.publishedAt
    if ('mastodon:scope' in item && 'summary' in item)
      item.title = feedme_find(item.summary, 'content', [['type', 'html']])
    add_post(storage, meta, follow, item_url, item, now)
  }
  parser.on('entry', item_func)
  parser.on('item', item_func)

  try {
    parser.write(res.body)
    let link = feedme_find(linkTags, 'href', [['rel', 'alternate'], ['type', 'text/html']])
    if (link)
      meta.url = url.resolve(meta.feed, link)
    parser.close()
  } catch (e) {
    //
    // Attempt to parse as HTML, to discover the feed.
    //
    let xml = sax.createStream(false, {lowercasetags: true}), format = PLAIN_HTML,
        feeds = [], maybeFeeds = [], lastName = null, lastHref = null, parents = [],
        capture = null
    xml.on('text', text => {
      if (text && lastName == 'title') {
        follow.actualTitle = text.trim()
        lastName = null
      } else if (format == PLAIN_HTML) {
        if (lastName == 'a') {
          if (`${lastHref} ${text}`.match(/rss|feed/i)) {
            maybeFeeds.push({href: lastHref, title: text})
          }
        }
      } else if (format == TIDDLYWIKI) {
        if (capture)
          capture.description += text
      }
    }).on('opentag', node => {
      lastName = node.name
      if (lastName == 'meta') {
        if (node.attributes['name'] == 'generator' && node.attributes['content'] == 'TiddlyWiki') {
          format = TIDDLYWIKI
        }
      } else if (lastName == 'link') {
        let rel = node.attributes['rel'], type = node.attributes['type']
        if ((rel == 'alternate' || rel == 'feed') && type && type.match(/xml|json/i)) {
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
          feeds.push({title, href: url.resolve(meta.feed, node.attributes['href'])})
        } else if (rel && rel.match(/icon/i) && !rel.match(/mask/i)) {
          add_photo(meta, node.attributes['sizes'] || rel, node.attributes['href'])
        }
      } else if (format == PLAIN_HTML) {
        if (lastName == 'a') {
          lastHref = node.attributes['href']
        }
      } else if (format == TIDDLYWIKI) {
        if (lastName == 'div') {
          let p = parents[0]  
          if (p && p.attributes['id'] == 'storeArea') {
            let title = node.attributes['title']
            if (title && !title.match(/^\$:\//)) {
              let publishedAt = node.attributes['created']
              if (publishedAt) {
                let updatedAt = twDate(node.attributes['modified'] || publishedAt)
                publishedAt = twDate(publishedAt)
                capture = {description: "", publishedAt, updatedAt, title}
              }
            }
          }
          if (!node.isSelfClosing)
            parents.unshift(node)
        }
      }
    }).on('closetag', name => {
      if (format == TIDDLYWIKI && name == 'div') {
        let node = parents.shift()
        let p = parents[0]  
        if (p && p.attributes['id'] == 'storeArea') {
          if (capture) {
            capture.description = capture.description.trim()
            add_post(storage, meta, follow, meta.feed + "#" + encodeURIComponent(capture.title), capture, now)
            capture = null
          }
        }
      }
      lastName = null
    })
    xml.write('<root>')
    xml.write(res.body)
    if (format == TIDDLYWIKI)
      return null
    if (feeds.length == 0) feeds = maybeFeeds
    if (feeds.length == 1) {
      meta.feed = normalizeFeedUrl(meta.feed, feeds[0].href)
      return await feedme_get(rss, options, storage, meta, follow, {})
    }
    return feeds
  }
}
 
//
// This uses RSS for the feed, but uses the site's social media
// metadata for the avatar, title and such.
//
async function site_rss(options, storage, meta, follow, res) {
  let doc = u('<div>').html(res.body)
  let can = doc.find('link[rel="canonical"]')
  if (can.length != 0)
    meta.url = can.attr('href')
  meta.title = doc.find('meta[property="twitter:title"]').attr('content')
  meta.photos = {avatar: doc.find('meta[property="twitter:image"]').attr('content')}
  meta.description = doc.find('meta[property="twitter:description"]').attr('content')

  let url = urlToNormal(meta.url), match = null
  if ((match = url.match(/^youtube\.com\/channel\/([-\w]+)/)) !== null) {
    meta.feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`
  } else if ((match = url.match(/^([\.\w]+\.)?reddit\.com\/r\/([^\/]+)/)) !== null) {
    meta.feed = `http://www.reddit.com/r/${match[2]}/top/.rss?sort=top`
  } else if ((match = url.match(/^([\.\w]+\.)?reddit\.com\/user\/([^\/]+)/)) !== null) {
    meta.feed = `http://www.reddit.com/user/${match[2]}/.rss`
  }
  return await feedme_get(rss, options, storage, meta, follow, {})
}

//
// Scrape a Twitter page.
//
async function twitter(options, storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(res.body)
  meta.title = doc.find('h1').text()
  meta.photos = {avatar: doc.find('img.ProfileAvatar-image').attr('src')}
  meta.description = doc.find('p.ProfileHeaderCard-bio').html()
  doc.find('div.tweet').each(tweet => { tweet = u(tweet)
    let item_url = url.resolve(meta.feed, tweet.attr('data-permalink-path').toString())
    let item_time = new Date(tweet.find('span[data-time]').attr('data-time') * 1000)
    let desc = tweet.find('p.tweet-text')
    desc.find('a').before(' ')
    let item = {description: desc.html(),
      publishedAt: item_time, updatedAt: item_time}
    add_post(storage, meta, follow, item_url, item, now)
  })
}

//
// Scrape an Instagram page.
//
async function instagram(options, storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(res.body)
  meta.title = doc.find('title').text().trim()
  doc.find('script').each(script => {
    let scr = script.innerText.match(/([^{]+?({.*profile_pic_url.*})[^}]+?)/)
    if (scr) {
      let data = JSON.parse(scr[2])['entry_data']['ProfilePage'][0]['graphql']['user']
      meta.description = data.biography
      meta.photos = {avatar: data.profile_pic_url}
      data.edge_owner_to_timeline_media.edges.forEach(obj => {
        let item = obj.node
        let item_url = 'https://www.instagram.com/p/' + item.shortcode
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

//
// Scrape a SoundCloud page.
//
async function soundcloud(options, storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(res.body)
  let article = u('<div>').html(doc.find('noscript:not(.errorPage__inner)').html())
  // console.log(article)
  meta.title = article.find('h1').text()
  meta.photos = {avatar: article.find('img[itemprop="image"]').text()}
  meta.description = article.find('p[itemprop="description"]').html()
  article.find('article.audible').each(n => { n = u(n)
    let a = n.find('a[itemprop="url"]')
    let item_url = url.resolve(meta.feed, a.attr('href'))
    let item_time = new Date(n.find('time[pubdate]').text())
    let item = {description: a.text(),
      publishedAt: item_time, updatedAt: item_time}
    add_post(storage, meta, follow, item_url, item, now)
  })
}

//
// Scrape Facebook (unfinished).
//
async function facebook(options, storage, meta, follow, res) {
  let now = new Date()
  let doc = u('<div>').html(res.body)
  meta.title = doc.find('title').text().trim()
  meta.photos = {avatar: doc.find('meta[property="og:image"]').attr('content')}
  meta.description = doc.find('meta[property="og:description"]').attr('content')
  // doc.find('[data-ft]').each(n => {
  //   let a = n.find('a[itemprop="url"]')
  //   let item_url = url.resolve(meta.feed, a.attr('href'))
  //   let item_time = new Date(n.find('time[pubdate]').text())
  //   let item = {description: a.text(),
  //     publishedAt: item_time, updatedAt: item_time}
  //   add_post(storage, meta, follow, item_url, item, now)
  // })
}

//
// This pair of functions is designed to find the closest matching object
// based on available attributes. This is useful when attempting to choose between:
//
//   <link rel="self" href="..." />
//   <link rel="alternate" href="..." />
//   <link>...</link>
//
// Again, this might not be necessary if FeedMe could be taught to discern
// between different feed formats.
//
function find_one(obj, where) {
  let ans = obj.find(x => where.every(v => x[v[0]] === v[1]))
  if (!ans) {
    if (where.length > 1) {
      ans = find_one(obj, where.slice(0, -1))
    } else {
      ans = obj[0]
    }
  }
  return ans
}

function feedme_find(obj, key, where) {
  if (typeof(obj) === 'string')
    return obj
  let text = obj.text
  if (obj.find)
    obj = find_one(obj, where)
  return obj ? (obj[key] || obj) : text
}

//
// Respect cache headers and prevent re-fetching content. This is mostly
// relevant to Beaker (because the fetch API respects caching).
//
async function feedme_get(fn, options, storage, meta, follow, lastFetch) {
  let now = new Date()
  let hdrs = {}
  if (lastFetch) {
    if (lastFetch.etag)
      hdrs['If-None-Match'] = lastFetch.etag
    else if (lastFetch.modified)
      hdrs['If-Modified-Since'] = lastFetch.modified
  }

  let res, feeds = null
  try {
    res = await storage.fetch(meta.feed, {headers: hdrs, credentials: 'omit'})
  } catch (e) {
    if (e.message === "net::ERR_NAME_NOT_RESOLVED") {
      throw `Could not find host ${url.parse(meta.feed).host}`
    } else if (e.message === "net::ERR_PROXY_CONNECTION_FAILED") {
      throw "Proxy connection failed"
    } else if (e.message === "net::ERR_CONNECTION_RESET") {
      throw "Connection was reset"
    } else if (e.message === "net::ERR_CONNECTION_CLOSE") {
      throw "Connection closed"
    } else if (e.message === "net::ERR_INTERNET_DISCONNECTED") {
      throw "Internet disconnected, check your wires"
    } else if (e.message === "net::ERR_CONNECTION_TIMED_OUT") {
      throw "Connection timed out"
    } else {
      throw e.message
    }
  }

  // console.log([meta.feed, res, lastFetch])
  if (res.status == 304) {
    console.log(`${meta.feed} hasn't changed.`)
    lastFetch.status = res.status
    lastFetch.at = new Date()
    return
  }

  if (res.status >= 300 && res.status < 400) {
    meta.feed = normalizeFeedUrl(meta.feed, res.headers['location'])
    return await feedme_get(fn, options, storage, meta, follow, {})
  }

  follow.feed = meta.feed
  follow.id = urlToID(urlToNormal(meta.feed))
  follow.response = {etag: res.headers['etag'],
    modified: res.headers['last-modified'],
    status: res.status}
  if (!res.ok)
    throw `${meta.feed} is giving a ${res.status} error.`

  feeds = await fn(options, storage, meta, follow, res)
  if (feeds)
    return feeds

  follow.url = meta.url
  follow.actualTitle = meta.title
  if (meta.photos)
    follow.photo = meta.photos['16x16'] || meta.photos['icon'] || Object.values(meta.photos)[0]
  follow.posts = meta.posts.slice(0, POSTS_IN_MAIN_INDEX)

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
  storage.writeFile(`/feeds/${follow.id}.json`, meta)
}

async function meta_get(storage, follow) {
  if (follow.id) {
    try {
      return await storage.readFile(`/feeds/${follow.id}.json`)
    } catch (e) {}
  }
  return {createdAt: new Date(), url: follow.url, posts: []}
}

//
// Determine parsing strategy from the URL.
//
export default async (storage, follow, lastFetch) => {
  let meta = await meta_get(storage, follow)
  let url = urlToNormal(meta.url), match = null
  if (!lastFetch)
    lastFetch = {}
  let proc = rss, options = {}
  if (!meta.feed) {
    meta.feed = follow.url
    if ((match = url.match(/^pinboard\.in\/([^?]+)/)) !== null)
      meta.feed = `http://feeds.pinboard.in/rss/${match[1]}`
  }
  if (url.startsWith('twitter.com/')) {
    proc = twitter
  } else if (url.startsWith('instagram.com/')) {
    proc = instagram
  } else if (url.startsWith('soundcloud.com/')) {
    proc = soundcloud
  } else if ((match = url.match(/^([\.\w]+\.)?facebook\.com\/([^\/?]+)/)) !== null) {
    meta.feed = `https://m.facebook.com/${match[2]}`
    proc = facebook
  } else if (url.startsWith('youtube.com/')) {
    proc = site_rss
    options.ignoreUpdated = true
  } else if ((match = url.match(/^([\.\w]+\.)?reddit\.com\//)) !== null) {
    proc = site_rss
  }
  return await feedme_get(proc, options, storage, meta, follow, lastFetch)
}
