const ent = require('ent/decode')
const normalizeUrl = require('normalize-url')
import u from '@kickscondor/umbrellajs'

export const house = "\u{1f3e0}"

export const Importances = [
  [0,   "Real-time", "\u{1f684}", "Following this with complete devotion."], // 1f525
  [1,   "Frequent", "\u{1f304}", "Keep just out of view. Nevertheless: beloved."], // 2728
  [7,   "Occasional", "\u{1f407}", "For when I have free time."], 
  [30,  "Sometime", "\u{1f34a}", "Maintaining a mild curiosity here."],
  [365, "Rarely", "\u{2602}", "Not very active. Or, just don't lose this."]
]

export async function responseToObject (resp) {
  let headers = {}
  let body = await resp.text()
  for (let h of resp.headers)
    headers[h[0].toLowerCase()] = h[1]
  return {status: resp.status, ok: resp.ok, url: resp.url, body, headers}
}

export function fixupHeaders (options, list) {
  if (options && options.headers) {
    let fix = {}
    for (let k in options.headers) {
      fix[(list.includes(k) ? 'X-FC-' : '') + k] = options.headers[k]
    }
    options.headers = fix
  }
  return options
}

export function getIndexById (ary, id, field = 'id') {
  for (let i = 0; i < ary.length; i++) {
    if (ary[i][field] == id)
      return i
  }
  return -1
}

export function getMaxIndex (index) {
  let vals = Object.values(index)
  if (vals.length == 0)
    return 0
  return Math.max(...vals)
}

export function html2text (html) {
  if (html.replace)
    html = html.replace(/[a-z]+:\/\//g, ' ')
  return u("<div>" + html).text()
}

export function urlToFeed(abs, href) {
  return normalizeUrl(url.resolve(abs, href), {stripWWW: false, stripHash: true, removeTrailingSlash: false})
}

export function urlToNormal (link) {
  try {
    return normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
  } catch {
    return link
  }
}

export function urlToID (normLink) {
  let hashInt = normLink.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)
  return `${normLink.split('/')[0]}-${(hashInt >>> 0).toString(16)}`
}

export function followTitle(follow) {
  return follow.title || follow.actualTitle || follow.url
}

export function isValidFollow(follow) {
  return follow.url && follow.feed && follow.id
}

export function sortBySettings(follow, settings) {
  let sortPosts = settings['mode-updates'] || 'publishedAt'
  let showReposts = settings['mode-reposts'] === 'all'
  let sortedBy = [sortPosts, showReposts].join(',')
  if (follow.sortedBy !== sortedBy) {
    follow.sortedBy = sortedBy
    follow.posts.sort((a, b) =>
      ((showReposts || !b.author || b.author === follow.author)
        && b[sortPosts] > a[sortPosts]) ? 1 : -1)
  }
}

//
// HTML traversal and string building.
//
export function parseDom(str, mime) {
  return (new DOMParser()).parseFromString(str, mime)
}

function innerHtmlDom(node) {
  let v = node.value || (node.nodeValue && ent(node.nodeValue))
  if (v) return v

  if (node.hasChildNodes())
  {
    v = ''
    for (let c = 0; c < node.childNodes.length; c++) {
      let n = node.childNodes[c]
      v += n.value || (n.nodeValue ? ent(n.nodeValue) : n.innerHTML)
    }
  }
  return v
}

export function xpathDom(doc, node, path, asText, ns) {
  let lookup = null
  if (ns) lookup = (pre) => ns[pre]
  let result = doc.evaluate(path, node, lookup, 7, null), list = []
  for (let i = 0; i < result.snapshotLength; i++) {
    let node = result.snapshotItem(i)
    if (node) {
      list.push(asText ? innerHtmlDom(node) : node)
    } else {
      break
    }
  }
  return list
}
