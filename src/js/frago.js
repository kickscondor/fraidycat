//
// src/js/frago.js
// Library used throughout Fraidycat for fragmenting objects (used to
// circumvent web extension file size quotas).
//
module.exports = {
  //
  // Compare two 'post' objects
  //
  cmp(follow, a, b, sortPosts, showReposts) {
    if (!showReposts) {
      if (!b.author || b.author === follow.author) {
        if (a.author && a.author !== follow.author)
          return 1
      }
    }
    return b[sortPosts] > a[sortPosts] ? 1 : -1
  },

  //
  // Sort a feed using the above sort function.
  //
  sort(follow, settings) {
    let sortPosts = settings['mode-updates'] || 'publishedAt'
    let showReposts = settings['mode-reposts'] !== 'hide'
    let sortedBy = [sortPosts, showReposts].join(',')
    if (follow.sortedBy !== sortedBy) {
      follow.sortedBy = sortedBy
      follow.posts.sort((a, b) =>
        this.cmp(follow, a, b, sortPosts, showReposts))
    }
  },

  //
  // Build a truncated master index of various sorts.
  //
  master(follow, sortFields, limit) {
    let posts = follow.posts.slice(0, limit)
    if (posts.length > 0) {
      for (let sortField of sortFields) {
        for (let reposts of [true, false]) {
          let sb = [sortField, reposts].join(',')
          if (follow.sortedBy !== sb) {
            let add = follow.posts.concat().sort((a, b) =>
              this.cmp(follow, a, b, sortField, reposts)).
              slice(0, limit)
            posts = posts.concat(add)
          }
        }
      }
      posts = Array.from(new Set(posts))
    }
    return posts
  },

  //
  // Merge separated objects back into a single object. The 'items' object is
  // a dictionary with keys of the form 'follows/0', 'follows/1' ... 'follows/N'
  // that are fragments of the 'follows' object. (There can be holes - this will
  // result in a partial object.)
  //
  // This also builds an 'index' key that lists the number of the source fragment
  // for each key. This is useful when merging new fragments or making updates to
  // entries one-by-one.
  //
  merge(items, subkey, decode = null) {
    let master = {[subkey]: {}, index: {}}
    for (let k in items) {
      let km = k.split('/'), data = items[k]
      if (decode) {
        data = decode(data)
      }
      if (km[0] === subkey) {
        let n = Number(km[1])
        for (let id in data)
          master.index[id] = n
        Object.assign(master[km[0]], data)
      } else {
        master[k] = data
      }
    }
    return master
  },

  //
  // Separate the master 'items' object into parts. The 'subkey' indicates with
  // subkey contains the object to separate. The 'index' keys
  // from the above 'merge' function are also expected.
  //
  async separate(items, subkey, ids = null, save = null) {
    //
    // Built each full part. We may need to save the individual part once it's
    // time to shift things around.
    //
    let synced = {}, parts = [], maxIndex = 0
    for (let k in items[subkey]) {
      let i = items.index[k]
      if (typeof(i) === 'undefined')
        items.index[k] = i = 0
      if (i > maxIndex)
        maxIndex = i
      let id = `${subkey}/${i}`
      let s = synced[id] || {}
      s[k] = items[subkey][k]
      synced[id] = s
      if ((!ids || ids.includes(k)) && !parts.includes(i))
        parts.push(i)
    }

    //
    // Attempt to save each piece - if it fails, take off an item and try again.
    //
    for (let i = 0; i <= maxIndex; i++) {
      if (parts.includes(i)) {
        let k = `${subkey}/${i}`
        try {
					await save(k, synced[k])
        } catch (e) {
          let id = Object.keys(synced[k]).pop()
					let maxk = `${subkey}/${i + 1}`
          delete synced[k][id]
          if (i === maxIndex) {
            maxIndex++
            if (!(maxk in synced))
              synced[maxk] = {}
          }
          if (!parts.includes(i + 1))
						parts.push(i + 1)
          items.index[id] = i + 1

					synced[maxk][id] = items[subkey][id]
          i--
        }
      }
    }
  }
}
