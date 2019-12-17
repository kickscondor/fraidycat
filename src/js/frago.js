//
// src/js/frago.js
// Library used throughout Fraidycat for fragmenting objects (used to
// circumvent web extension file size quotas).
//
module.exports = {
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
    let master = {[subkey]: {}, index: {}, maxIndex: 0}
    for (let k in items) {
      let km = k.split('/'), data = items[k]
      if (decode) {
        data = decode(data)
      }
      if (km[0] === subkey) {
        let n = Number(km[1])
        if (n > master.maxIndex)
          master.maxIndex = n
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
  // subkey contains the object to separate. The 'index' and 'maxIndex' keys
  // from the above 'merge' function are also expected.
  //
  async separate(items, subkey, ids = null, save = null) {
    //
    // Built each full part. We may need to save the individual part once it's
    // time to shift things around.
    //
    let synced = {}, parts = []
    for (let k in items[subkey]) {
      let i = items.index[k]
      if (typeof(i) === 'undefined')
        items.index[k] = i = 0
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
    for (let i = 0; i <= items.maxIndex; i++) {
      if (parts.includes(i)) {
        let k = `${subkey}/${i}`
        try {
					await save(k, synced[k])
        } catch (e) {
          let id = Object.keys(synced[k]).pop()
          delete synced[k][id]
          if (i === items.maxIndex) {
            items.maxIndex++
					  synced[`${subkey}/${items.maxIndex}`] = {}
          }
          if (!parts.includes(i + 1))
						parts.push(i + 1)
          items.index[id] = i + 1

					synced[`${subkey}/${i + 1}`][id] = items[subkey][id]
          i--
        }
      }
    }
  }
}
