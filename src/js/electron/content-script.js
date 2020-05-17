import 'regenerator-runtime/runtime'
import { parseDom, xpathDom } from '../util' 

const { remote, ipcRenderer } = require('electron')
const fraidyscrape = require('fraidyscrape')

ipcRenderer.on('scrape', async (e, msg) => {
  let {tasks, site, url} = msg
  let scraper = new fraidyscrape({}, parseDom, xpathDom)
  let error = null
  try {
    await scraper.scrapeRender(tasks, site, window)
  } catch {
    error = "Couldn't find a follow at this location."
  }
  ipcRenderer.sendToHost('scrape', {tasks, url, error})
})
