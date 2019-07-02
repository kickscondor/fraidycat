const normalizeUrl = require('normalize-url')

export function getIndexById (ary, id) {
  for (let i = 0; i < ary.length; i++) {
    if (ary[i].id == id)
      return i
  }
  return -1
}

export function urlToNormal (link) {
  return normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
}

export function urlToID (normLink) {
  let hashInt = normLink.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)
  return `${normLink.split('/')[0]}-${(hashInt >>> 0).toString(16)}`
}
