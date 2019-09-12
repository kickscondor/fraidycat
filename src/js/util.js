const normalizeUrl = require('normalize-url')

export async function responseToObject (resp) {
  let headers = {}
  let body = await resp.text()
  for (let h of resp.headers)
    headers[h[0]] = h[1]
  return {status: resp.status, ok: resp.ok, url: resp.url, body, headers}
}

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
