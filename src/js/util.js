const ent = require('ent/decode')
let normalizeUrl = null
import('normalize-url').then(x => normalizeUrl = x.default)
const sanitizeHtml = require('./sanitize')
const u = require('@kickscondor/umbrellajs')

const house = "\u{1f3e0}"

const Importances = [
  [0,   "Realtime", "\u{1f684}", "Following this with complete devotion."], // 1f525
  [1,   "Frequent", "\u{1f304}", "Keep just out of view. Nevertheless: beloved."], // 2728
  [7,   "Occasional", "\u{1f407}", "For when I have free time."], 
  [30,  "Sometime", "\u{1f34a}", "Maintaining a mild curiosity here."],
  [365, "Rarely", "\u{2602}", "Not very active. Or, just don't lose this."]
]

async function responseToObject (resp) {
  let headers = {}
  let body = await resp.text()
  for (let h of resp.headers)
    headers[h[0].toLowerCase()] = h[1]
  return {status: resp.status, ok: resp.ok, url: resp.url, body, headers}
}

function fixupHeaders (options, list) {
  if (options && options.headers) {
    let fix = {}
    for (let k in options.headers) {
      fix[(list.includes(k) ? 'X-FC-' : '') + k] = options.headers[k]
    }
    options.headers = fix
  }
  return options
}

function getIndexById (ary, id, field = 'id') {
  for (let i = 0; i < ary.length; i++) {
    if (ary[i][field] == id)
      return i
  }
  return -1
}

function getMaxIndex (index) {
  let vals = Object.values(index)
  if (vals.length == 0)
    return 0
  return Math.max(...vals)
}

const ATTR_DIM = 1
const ATTR_SRC = 2
const ATTR_HREF = 3

//
// Sanitize some attributes where a range of options is allowed
// TODO: Scan 'style' attributes for acceptable CSS.
//
function sanitizeAttr(ele, name, type, attr, url) {
  let a = ele.attributes.getNamedItem(name), m
  if (a && a.value) {
    let val = a.value
    switch (type) {
      case ATTR_DIM:
        m = val.match(/^(\d+)$|^(\d+)%$/)
        if (!m) {
          return false
        }
        if (m[1]) {
          //
          // Allow from 5px to 500px as a dimension
          // 
          let n = Number(m[1])
          if (n < 5 && n > 500) {
            return false
          }
        } else if (m[2]) {
          //
          // Allow 5% to 100 dimension size
          //
          let n = Number(m[2])
          if (n < 5 && n > 100) {
            return false
          }
        }
      break
      case ATTR_SRC:
        //
        // Allow HTTPS and Hypercore network URLs
        //
        m = a.value.match(/^((https?|hyper):)?\/\/|(\w+:\/\/)/)
        if (m) {
          if (m[3]) {
            return false
          }
        } else {
          val = new URL(val, url).toString()
        }
      break
      case ATTR_HREF:
        //
        // Allow a few different link URL types
        // TODO: Allow fragment links and rewrite the IDs to make them work.
        //
        m = a.value.match(/^((https?|ftp|mailto|hyper):)?\/\/|(\w+:\/\/)/)
        if (m) {
          if (!m[3]) {
            attr.target = '_blank'
          } else {
            return false
          }
        } else {
          attr.target = '_blank'
          val = new URL(val, url).toString()
        }
      break
    }

    attr[name] = val
    return true
  }
  return false
}

//
// Whitelist for specific tags allowed in HTML throughout Fraidycat
//
function sanitize(html, url) {
  let dirty = html
  if (dirty.nodeType >= 2 && dirty.nodeType <= 4) {
    return html
  } else if (dirty.nodeType >= 5 && dirty.nodeType <= 8) {
    return ''
  }

  return sanitizeHtml(dirty, ele => {
    let attr = {}
    if ((ele.nodeType >= 2 && ele.nodeType <= 4) || ele.nodeType === 11) {
      return true
    } else if (ele.nodeType >= 5 && ele.nodeType <= 10) {
      return false
    }

    switch (ele.tagName.toUpperCase()) {
      case 'STYLE': case 'SCRIPT':
        ele.parentNode.removeChild(ele)
        return false
      case 'AUDIO':
      case 'VIDEO':
        sanitizeAttr(ele, 'width', ATTR_DIM, attr)
        sanitizeAttr(ele, 'height', ATTR_DIM, attr)
        attr.controls = 'true'
        break
      case 'SOURCE':
        sanitizeAttr(ele, 'type', 0, attr)
        if (!sanitizeAttr(ele, 'src', ATTR_SRC, attr, url)) {
          return false
        }
        break
      case 'TRACK':
        sanitizeAttr(ele, 'kind', 0, attr)
        sanitizeAttr(ele, 'srclang', 0, attr)
        sanitizeAttr(ele, 'label', 0, attr)
        if (!sanitizeAttr(ele, 'src', ATTR_SRC, attr, url)) {
          return false
        }
        break
      case 'IFRAME':
      case 'IMG':
        sanitizeAttr(ele, 'width', ATTR_DIM, attr)
        sanitizeAttr(ele, 'height', ATTR_DIM, attr)
        if (!sanitizeAttr(ele, 'src', ATTR_SRC, attr, url)) {
          return false
        }
        break
      case 'A':
        sanitizeAttr(ele, 'alt', 0, attr)
        if (!sanitizeAttr(ele, 'href', ATTR_HREF, attr, url)) {
          return false
        }
      case 'DFN': case 'ABBR':
        sanitizeAttr(ele, 'title', 0, attr)

      //
      // With text markup, eliminate tags that are basically empty.
      //
      case 'BLOCKQUOTE': case 'P': case 'NL': case 'LABEL':
      case 'CODE': case 'CAPTION': case 'CITE': case 'LI': case 'ADDRESS':
      case 'TH': case 'TD': case 'PRE': case 'DT': case 'DD':
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      case 'FIGCAPTION': case 'SUMMARY': case 'TIME':
      case 'DIV':
        if (!ele.textContent.trim() && !ele.hasChildNodes()) {
          return false
        }
        break

      //
      // With container elements, remove them if they have no children
      //
      case 'DL': case 'DI': case 'UL': case 'OL': case 'DEL': case 'INS':
      case 'B': case 'I': case 'STRONG': case 'EM': case 'STRIKE':
      case 'S': case 'SMALL': case 'SUB': case 'SUP': case 'U':
      case 'TABLE': case 'THEAD': case 'TBODY': case 'TFOOT': case 'TR':
      case 'DETAILS': case 'FIGURE': case 'ARTICLE': case 'ASIDE':
      case 'FOOTER': case 'HEADER': case 'MAIN':
        if (!ele.hasChildNodes()) {
          return false
        }

      case 'HR':
        break
      case 'BR': case 'WBR':
        if (ele.parentNode.firstChild == ele || ele.parentNode.lastChild == ele)
          return false
        break
      default:
        return false
    }

    while (ele.attributes.length > 0) {
      ele.removeAttribute(ele.attributes[0].name)
    }

    for (let k in attr) {
      ele.setAttribute(k, attr[k])
    }

    return true
  })
}

function html2text (html) {
  if (html.replace)
    html = html.replace(/[a-z]+:\/\//g, ' ')
  return u("<div>" + html).text()
}

function urlToFeed(abs, href) {
  return normalizeUrl(url.resolve(abs, href), {stripWWW: false, stripHash: true, removeTrailingSlash: false})
}

function urlToNormal (link, stripHash) {
  try {
    return normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash})
  } catch {
    return link
  }
}

function urlToID (normLink) {
  let hashInt = normLink.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)
  return `${normLink.split('/')[0]}-${(hashInt >>> 0).toString(16)}`
}

function followTitle(follow) {
  return follow.title || follow.actualTitle || follow.url
}

function isValidFollow(follow) {
  return follow.url && follow.feed && follow.id
}

function sortBySettings(follow, settings) {
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
function parseDom(str, mime) {
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

function xpathDom(doc, node, path, asText, ns) {
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

module.exports = {fixupHeaders, followTitle, getIndexById, getMaxIndex, house,
  html2text, innerHtmlDom, isValidFollow, parseDom, responseToObject, sanitize,
  sortBySettings, urlToFeed, urlToID, urlToNormal, xpathDom, Importances}
