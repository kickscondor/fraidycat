//
// src/js/follows.js
//
// The follows module for Hyperapp. This is just a shell for calling out
// to the storage module, which handles all the updating of follows and
// platform-specific handling. (On Dat, this is all done in the foreground;
// in a web extension, it's done in the background page.)
//
const storage = require('./storage-platform')
const { alert, confirm, urgent } = require('./dialogs')

import { applyOperation } from 'fast-json-patch'
import { followTitle } from './util'
import u from '@kickscondor/umbrellajs'

export default ({
  state: {all: {}, started: false},
  actions: {
    //
    // On startup, check for synced data from other sources (other browsers,
    // other dats) and setup sync events.
    //
    init: () => async (state, {update}) => {
      let local = await storage()
      local.client(msg => update(msg))
      local.command('setup')
      state.local = local
    },

    //
    // Receive updates from the background process.
    //
    update: (patch) => (state, {location, set}) => {
      // console.log([state, patch])
      if (patch.op === 'discovery') {
        location.go("/add-feed")
        return {feeds: {list: patch.feeds, site: patch.follow}}
      } else if (patch.op === 'subscription') {
        location.go(`/${patch.follow.tags && patch.follow.tags[0] ?
          `tag/${encodeURIComponent(patch.follow.tags[0])}` : ''}?importance=${patch.follow.importance}`)
      } else if (patch.op === 'exported') {
        var data = "data:" + patch.mimeType +
          ";charset=UTF-8," + encodeURIComponent(patch.contents)
        var link = document.createElement('a')
        link.setAttribute('download', 'fraidycat.' + patch.format)
        link.setAttribute('href', data)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else if (patch.op === 'autoUpdate') {
        return {urgent: {note: `Update to version ${patch.version}`,
          approve: () => {
            state.local.command("autoUpdateApproved")
            set({urgent: null})
          }
        }}
      } else if (patch.op === 'error') {
        if (patch.follow) {
          if (confirm(`${patch.message}\n\nAdd this follow anyway? (In case it might be down for the moment.)`)) {
            patch.follow.force = true
            state.local.command("save", patch.follow)
            return
          }
        } else {
          alert(patch.message)
        }

        u('#working').attr('style', '')
        u('form button').each(ele => ele.disabled = false)
      } else if (patch.op) {
        try {
          return applyOperation(state, patch)
        } catch {}
      } else {
        return patch
      }
    },

    //
    // Change a setting.
    //
    changeSetting: s => ({local}) => {
      local.command("changeSetting", s)
    },

    //
    // Save a single follow, after add or edit.
    //
    save: follow => ({local}, {location, goToFollow, set}) => {
      follow.editedAt = new Date()
      local.command("save", follow)
    },

    //
    // Subscribe to follows from a list found within an HTML page.
    //
    subscribe: fc => async ({local}) => {
      local.command("subscribe", fc)
    },

    //
    // Delete confirmation event from HTML.
    //
    confirmRemove: follow => ({local}, {location}) => {
      if (confirm(`Delete ${followTitle(follow)}?\n(${follow.url})`)) {
        local.command("remove", follow)
      }
    },

    //
    // Rename a tag.
    //
    rename: tag => ({local}) => {
      local.command("rename", tag)
    },

    //
    // Import follows from OPML.
    //
    importFrom: (e) => ({local}, {location}) => {
      let f = e.target.files[0]
      if (f) {
        let r = new FileReader()
        r.onload = async function (o) {
          let contents = o.target.result, format = e.target.name
          local.command("importFrom", {format, contents})
          if (window.location.pathname === "/settings.html")
            window.close()
          else
            location.go("/")
        }
        r.readAsText(f)
      }
    },

    //
    // Export follows to OPML.
    //
    exportTo: (format) => ({local}) => {
      local.command("exportTo", {format})
    }
  }
})
