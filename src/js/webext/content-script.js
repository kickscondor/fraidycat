import 'regenerator-runtime/runtime'
import { parseDom, xpathDom } from '../util' 
import { jsonDateParser } from "json-date-parser"

if (window.self !== window.top) {
  const browser = require('webextension-polyfill')
  const fraidyscrape = require('fraidyscrape')

  let scraper = new fraidyscrape({}, parseDom, xpathDom)
  let extURL = browser.extension.getURL('/').replace(/\/$/, '')

  window.addEventListener('message', async e => {
    let {tasks, site, url} = JSON.parse(e.data, jsonDateParser)
    let error = null
    try {
      await scraper.scrapeRender(tasks, site, window)
    } catch {
      error = "Couldn't find a follow at this location."
    }
    e.source.postMessage(JSON.stringify({tasks, url, error}), extURL)
  })
}
