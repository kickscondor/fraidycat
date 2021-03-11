import 'regenerator-runtime/runtime'
import { parseDom, xpathDom } from '../util' 
import { jsonDateParser } from "json-date-parser"

const browser = require('webextension-polyfill')
const fraidyscrape = require('fraidyscrape')

let extURL = browser.extension.getURL('/').replace(/\/$/, '')

async function scrapeMessage(data, options = null) {
  try {
    let scraper = new fraidyscrape(options ? JSON.parse(options, jsonDateParser) : {}, parseDom, xpathDom)
    let {tasks, site, url} = JSON.parse(data, jsonDateParser)
    let error = null
    try {
      if (options && site.url) {
        delete site.url
        site.accept = ["html"]
      }
      await scraper.scrapeRender(tasks, site, window)
    } catch (e) {
      error = "Couldn't find a follow at this location."
    }
    return JSON.stringify({tasks, url, error})
  } catch {}
}

//
// Messages coming in through the iframe: used for regular fetching
// of TikTok and other sites that require rendering.
//
window.addEventListener('message', async e => {
  let response = await scrapeMessage(e.data)
  e.source.postMessage(response, extURL)
})

//
// Messages coming in to sense the capabilities of the web page.
//
browser.runtime.onMessage.addListener(data => scrapeMessage(data.req, data.options))
