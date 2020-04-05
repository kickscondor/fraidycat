import test from 'ava'
const fs = require('fs')
const frago = require('./src/js/frago')

//
// 'frago' - piece merging tests
//
const syncParts = JSON.parse(fs.readFileSync('test/sync.json'))

test('basic merge on load', t => {
  t.plan(5)
  let sync = frago.merge(syncParts, 'follows')
  t.deepEqual(sync.follows['blog.presentandcorrect.com-f29bc778'],
    syncParts['follows/1']['blog.presentandcorrect.com-f29bc778'])
  t.is(1, sync.index['blog.presentandcorrect.com-f29bc778'])
  t.is(0, sync.index['warpdoor.com-3ae79d0c'])
  t.is(61, Object.keys(sync.follows).length)
  t.false(sync.settings.broadcast)
})

const PART_SIZE = 6400

function save(k, v) {
  let len = JSON.stringify(v).length
  if (len > PART_SIZE)
    throw new ArgumentError('too big!')
  return len
}

// new id
const add1 = {id: "discombobulated.co.nz-6679866", importance: "30",
  url: "https://discombobulated.co.nz/feed.rss", editedAt:"2019-10-25T22:03:12.632Z"}
// duplicate id
const add2 = {id: "granary.io-16f5f434", importance: "1", title: "IndieNews",
  url: "https://granary.io/url?input=html&output=atom&url=https%3A%2F%2Fnews.indieweb.org%2Fen",
  editedAt: "2019-10-07T22:04:30.365Z"}
// new id
const add3 = {id: "granary.io-5f16f434", importance: "7", title: "IndieNews",
  url: "https://granary.io/url?input=html&output=atom&url=https%3A%2F%2Fnews.indieweb.org%2Fen",
  editedAt: "2019-10-07T22:04:30.365Z"}

test('check sync part sizes', t => {
  t.plan(3)
  t.pass(save(0, syncParts['follows/0']))
  t.pass(save(0, syncParts['follows/1']))
  let part = Object.assign({}, syncParts['follows/0'])
  part[add1.id] = add1
  part[add2.id] = add2
  t.throws(() => save(0, part))
})

test('basic separation on save', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  await frago.separate(sync, 'follows', null,
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(61, len)
})

test('separation on additions', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  sync.follows[add1.id] = add1
  sync.follows[add2.id] = add2
  sync.follows[add3.id] = add3
  await frago.separate(sync, 'follows', [add1.id, add2.id, add3.id],
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(63, len)
})

test('separation on deletions', async t => {
  t.plan(3)
  let sync = frago.merge(syncParts, 'follows'), len = 0
  let keys = Object.keys(sync.follows)
  sync.follows[keys[0]] = {deleted: new Date()}
  sync.follows[keys[1]] = {deleted: new Date()}
  sync.follows[keys[2]] = {deleted: new Date()}
  await frago.separate(sync, 'follows', null,
    (k, v) => {
      t.assert(save(k, v) < PART_SIZE)
      len += Object.keys(v).length
    })
  t.is(61, len)
})

//
// Utility function tests
//
const feed = JSON.parse(fs.readFileSync('test/electrolemon.json'))

test('electrolemon: sort by fields', t => {
  t.plan(2)

  frago.sort(feed, 'updatedAt', true, true)
  t.is(feed.posts.slice(0, 4).map(x => x.id).join(','),
    'twitter.com-104e3097,twitter.com-9c0d8cfc,twitter.com-9dde7abc,twitter.com-cab7bde')
  let posts = frago.master(feed, ['publishedAt', 'updatedAt'], 10)
  t.assert(posts.some(x => x.id === 'twitter.com-104e3097'))
})
