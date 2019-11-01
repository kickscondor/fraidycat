//
// src/js/follows.js
//
// The follows module for Hyperapp. This is just a shell for calling out
// to the storage module, which handles all the updating of follows and
// platform-specific handling. (On Dat, this is all done in the foreground;
// in a web extension, it's done in the background page.)
//
let storage = null

if (process.env.STORAGE === 'dat') {
  storage = require('./storage/dat')
} else {
  storage = require('./storage/webext')
}

import { applyOperation } from 'fast-json-patch'

export default ({
  state: {all: {}, started: false},
  actions: {
    //
    // On startup, check for synced data from other sources (other browsers,
    // other dats) and setup sync events.
    //
    init: () => async (state, {update}) => {
      let local = await storage()
      local.command('setup', update)
      state.local = local
    },

    //
    // Receive updates from the background process.
    //
    update: (patch) => (state) => {
      console.log([state, patch])
      return patch.op ? applyOperation(state, patch) : patch
    },

    //
    // Go to a follow's tag/importance page.
    //
    goToFollow: follow => (_, {location}) => {
      location.go(`/${follow.tags && `tag/${follow.tags[0]}`}?importance=${follow.importance}`)
    },

    //
    // Save a single follow, after add or edit.
    //
    save: follow => ({local}, {location, goToFollow, set}) => {
      follow.editedAt = new Date()
      local.command("save", follow).then(feeds => {
        if (feeds) {
          set({feeds: {list: feeds, site: follow}})
          location.go("/add-feed")
        } else {
          goToFollow(follow)
        }
      }).catch(msg => {
        location.go("/")
        alert(`${follow.url} is ${msg}`)
      })
    },

    //
    // Subscribe to follows from a list found within an HTML page.
    //
    subscribe: fc => async ({local}, {goToFollow, location}) => {
      let errors = await local.command("subscribe", fc)
      goToFollow(fc.site)
      if (errors.length > 0)
        alert(errors.join("\n"))
    },

    //
    // Get all posts from a given follow.
    //
    getPosts: id => (_, {set}) => {
      return []
    },

    //
    // Get full post contents from a follow.
    //
    getPostDetails: ({id, post}) => (_, {set}) => {
      return {}
    },

    //
    // Delete confirmation event from HTML.
    //
    confirmRemove: follow => ({local}, {location}) => {
      if (confirm("Delete " + follow.url + "?")) {
        local.command("remove", follow)
        location.go("/")
      }
    },
  }
})
