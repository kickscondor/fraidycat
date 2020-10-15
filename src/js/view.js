import { followTitle, html2text, getIndexById, house, sortBySettings,
  isValidFollow, Importances } from './util'
import { h } from 'hyperapp'
import { jsonDateParser } from "json-date-parser"
import { Link, Route, Switch } from '@kickscondor/router'
import EmojiButton from '@kickscondor/emoji-button'
const frago = require('./frago')
const url = require('url')
const sparkline = require('./sparkline')
import u from '@kickscondor/umbrellajs'

import svg from '../images/*.svg'
import images from '../images/*.png'
import webp from '../images/*.webp'

const CAN_ARCHIVE = (process.env.STORAGE === 'dat')

const FormFreeze = (e) => {
  e.preventDefault()
  u('button', e.target).each(ele => ele.disabled = true)
}

const Setting = ({name, value}, children) => ({follows}, actions) =>
  <a href="#" class={follows.settings[name] === value && "sel"}
    onclick={e => {
      e.preventDefault()
      u(e.target).closest('div.sort').removeClass('show')
      actions.follows.changeSetting({name, value})
    }}>{children}</a>

const ToggleHover = (el, parentSel, childSel) => {
  let clicked = false
  let display = show => {
    let ele = u(el)
    if (parentSel) ele = ele.closest(parentSel)
    if (childSel) ele = ele.find(childSel)
    let isShown = ele.hasClass('show')
    if (clicked || show) {
      if (!isShown) ele.addClass('show')
    } else {
      if (isShown) ele.removeClass('show')
    }
  }
  u(el).on('mouseover', e => {
    display(true)
  }).on('mouseout', e => {
    display(false)
  })
}

const ToggleShow = (e, parentSel, cls) => {
  e.preventDefault()
  u(e.target).closest(parentSel).toggleClass(cls || "show")
}

const Nudge = (x) => a => {
  let div = u(a.parentNode)
  let ul = div.children('ul').first()
  let moveTimer = null
  let moveFn = () => {
    if (ul.style) {
      let newx = parseInt(ul.style.marginLeft || 0, 10) + x
      let endx = ul.scrollWidth - a.parentNode.clientWidth
      if (newx >= 0) {
        newx = 0
        clearInterval(moveTimer)
      } else if (newx < -endx) {
        newx = -endx
        clearInterval(moveTimer)
      }
      div.children('.left').attr('style', 'display: ' + (newx == 0 ? 'none' : 'block'))
      div.children('.right').attr('style', 'display: ' + (newx == -endx ? 'none' : 'block'))
      ul.style.marginLeft = newx + "px"
    }
  }
  u(a).on('mousedown', e => {
    moveFn()
    moveTimer = setInterval(moveFn, 50)
  }).on('mouseup', e => clearInterval(moveTimer)).
    on('click', e => e.preventDefault())

  let calcNudge = () => {
    let mx = parseInt(ul.style.marginLeft || 0, 10)
    ul.style.marginLeft = "0px"
    let show = a.parentNode.clientWidth < ul.scrollWidth
    div.children('.left').attr('style', 'display: ' +
      (show && mx > 0 ? 'block' : 'none'))
    div.children('.right').attr('style', 'display: ' +
      (show ? 'block' : 'none'))
  }

  window.addEventListener('resize', calcNudge, false)
  calcNudge()
}

const FollowForm = (match, setup, isNew) => ({follows}, actions) => {
  let follow = follows.editing
  let picker = new EmojiButton()
  if (setup) {
    if ('tag' in match.params) {
      follow.tags = [match.params.tag]
    }
    if ('importance' in match.params) {
      follow.importance = Number(match.params.importance)
    }
  }
  picker.on('emoji', ch => {
    if (follow.tags) { follow.tags.push(ch) } else { follow.tags = [ch] }
    actions.follows.set({follow})
  })

  return follow && <form class="follow" onsubmit={FormFreeze}>
    {isNew &&
      <div>
        <label for="url">URL <img src={follows.baseHref + images['supported']} /></label>
        <input type="text" id="url" name="url" value={follow.url} autocorrect="off" autocapitalize="none"
          oninput={e => follow.url = e.target.value} />
        <p class="note">(See <a href="https://rss.app/">RSS.app</a> and <a href="https://rssbox.herokuapp.com">RSS Box</a> for other services. Or <a href="https://notifier.in/integrations/email-to-rss">Notifier</a> for email newsletters.)</p>
      </div>}

    <div>
      <label for="importance">Importance</label> 
      <select id="importance" name="importance" onchange={e => follow.importance = Number(e.target.options[e.target.selectedIndex].value)}>
      {Importances.map(imp => 
        <option value={imp[0]} selected={imp[0] == follow.importance}>{imp[2]} {imp[1]} &mdash; {imp[3]}</option>)}
      </select>
      <p class="note">Only 'Real-time' follows will highlight the tab when there
        are updates.</p>
    </div>

    <div>
      <label for="tags" class="optional">Tag(s) &mdash; separate with spaces</label>
      <input type="text" id="tags" value={follow.tags ? follow.tags.join(' ') : ''}
        oninput={e => e.target.value ? (follow.tags = e.target.value.trim().split(/\s+/)) : (delete follow.tags)} />
      <a href="#" class="emoji" onclick={e => {
        e.preventDefault()
        picker.pickerVisible ? picker.hidePicker() : picker.showPicker(e)
      }}>&#128513;</a>
      <p class="note">(If left blank, tag is assumed to be '&#x1f3e0;'&mdash;the main page tag.)</p>
    </div>

    <div>
      <label for="title" class="optional">Title</label>
      <input type="text" id="title" value={follow.title}
        oninput={e => follow.title = e.target.value} />
      <p class="note">(Leave empty to use <em>{follow.actualTitle || "the title loaded from the site"}</em>.)</p>
    </div>

    {CAN_ARCHIVE &&
      <div>
        <input type="checkbox" id="fetchesContent" onclick={e => follow.fetchesContent = e.target.checked} checked={follow.fetchesContent} />
        <label for="fetchesContent">Read here?</label>
        <p class="note">(Check this to save a copy of complete posts and read them from Fraidycat.)</p>
      </div>}

    <div>
      <label for="limit" class="optional">Limit</label>
      <input type="number" id="limit" value={follow.limit} min='0' step='1'
        oninput={e => follow.limit = e.target.value ? parseInt(e.target.value) : undefined} />
      <p class="note">Number of recent feed entries to show. (If left blank, defaults to 10)</p>
    </div>

    <button onclick={e => {u('#working').attr('style', 'display: block'); return actions.follows.save(follow)}}>Save</button>
    {!isNew && <button type="button" class="delete" onclick={_ => actions.follows.confirmRemove(follow)}>Delete This</button>}

    <div id="working">
      <div>
        <img src={follows.baseHref + webp['working']} />
        <p>FOLLOWING</p>
      </div>
    </div>
  </form>
}

const EditFollowById = ({ match, setup }) => ({follows}) => {
  if (setup)
    follows.editing = JSON.parse(JSON.stringify(follows.all[match.params.id]), jsonDateParser)

  return <div id="edit-feed">
    <h2>Edit a Follow</h2>
    <p>URL: {follows.editing.url}</p>
    {FollowForm(match, setup, false)}
  </div>
}

const AddFollow = ({ match, setup }) => ({follows}) => {
  if (setup) {
    follows.editing = {url: match.params.url, title: match.params.title, importance: 0}
  }

  return <div id="add-feed">
    <h2>Add a Follow</h2>
    <p>What blog, wiki or social account do you want to follow?</p>
    <p class="note"><em>This can also be a Twitter or Instagram feed, a YouTube channel, a subreddit, a Soundcloud.</em></p>
    {FollowForm(match, setup, true)}
  </div>
}

const AddFeed = () => ({follows, settings}, actions) => {
  let {list, site} = follows.feeds
  let actual = list.some(feed => feed.type)
  return <div id="feed-select">
    <h2>Select a Feed</h2>
    <p>{actual ? `${site.url} has several feeds:` :
      `${site.url} has no official feeds, but a few possible feeds were found:`}</p>
    <form class="feeds" onsubmit={FormFreeze}>
    <ul>
    {list.map(feed =>
      <li><input type="checkbox" onclick={e => feed.selected = e.target.checked} value={feed.url} /> {feed.title}<br /><em>{feed.url}</em></li>)}
    </ul>
    <button onclick={_ => actions.follows.subscribe(follows.feeds)}>Subscribe</button>
    </form>
  </div>
}

function timeAgo(from_time, to_time) {
  if (Number(from_time) == 0)
    return ''

  from_time = Math.floor(from_time / 1000)
  to_time = Math.floor(to_time / 1000)
  let mins = Math.round(Math.abs(to_time - from_time)/60)

  if (mins == 0)
    return '1m'
  if (mins >= 1 && mins <= 45)
    return mins + 'm'
  if (mins >= 46 && mins <= 90)
    return '1h'
  if (mins >= 91 && mins <= 1440)
    return Math.round(mins / 60) + 'h'
  if (mins >= 1441 && mins <= 2880)
    return '1d'
  if (mins >= 2881 && mins <= 43220)
    return Math.round(mins / 1440) + 'd'
  if (mins >= 43221 && mins <= 86400)
    return '1M'
  if (mins >= 86401 && mins <= 525960)
    return Math.round(mins / 43200) + 'M'
  if (mins >= 525961 && mins <= 1051920)
    return '1Y'
  return Math.round(mins / 525600) + 'Y'
}

function timeDarkness(from_time, to_time) {
  from_time = Math.floor(from_time / 1000)
  to_time = Math.floor(to_time / 1000)
  let mins = Math.round(Math.abs(to_time - from_time)/60)

  if (mins >= 0 && mins < 3600)
    return 'age-h'
  if (mins >= 3600 && mins <= 43220)
    return 'age-d'
  return 'age-M'
}

function sparkpoints(el, ary) {
  if (!ary) ary = []
  let points = ary.slice(0, 60), len = 60
  let daily = points.reduce((a, b) => a + b, 0) > 3

  if (daily) {
    len = points.length
  } else {
    for (let i = 0; i < len; i++) {
      let x = i * 3
      points[i] = (ary[x] || 0) + (ary[x + 1] || 0) + (ary[x + 2] || 0)
    }
    if (points.every(x => x == 0))
      len = 0
  }
  u(el).empty().addClass(`sparkline-${daily ? "d" : "w"}`).attr('width', len * 2)
  el.parentNode.title = `graph of the last ${daily ? 'two' : 'six'} months`
  if (len > 0)
    sparkline(el, points.reverse())
}

function lastPostTime(follow, sortPosts) {
  let lastPostAt = new Date(0)
  if (follow.posts instanceof Array) {
    let lastPost = follow.posts[0]
    if (lastPost)
      lastPostAt = lastPost[sortPosts]
  }
  if (follow.status instanceof Array) {
    let lastPost = follow.status[0]
    if (lastPost && lastPost[sortPosts] > lastPostAt)
      lastPostAt = lastPost[sortPosts]
  }
  return lastPostAt
}

const Favicon = function(baseHref, follow) {
  let src = null
  try { src = url.resolve(follow.url, follow.photo || '/favicon.ico') } catch {}
  return src || (baseHref + svg['globe'])
}

const TitleMaxlen = 60, TitleMinlen = 24
const TitleTruncRe = new RegExp(`([-,.!;:)]\s[^-,.!;:]{0,${TitleMaxlen - TitleMinlen}}|\\s\\S*)$`)
const TitleTrunc = function(title) {
  if (title.length < TitleMaxlen)
    return title
  let res = title.slice(0, TitleMaxlen).match(TitleTruncRe)
  let index = TitleMaxlen
  if (res != null && res.index > TitleMinlen)
    index = res.index + 1
  return <span>{title.slice(0, index)}<s>{title.slice(index)}</s></span>
}

const ListFollow = ({ location, match }) => ({follows}, actions) => {
  let now = new Date()
  let tag = match.params.tag ? match.params.tag : house
  let tags = {}, imps = {}
  let sortPosts = follows.settings['mode-updates'] || 'publishedAt'
  let showReposts = follows.settings['mode-reposts'] !== 'hide'
  let viewable = Object.values(follows.all).filter(follow => {
    let ftags = (follow.tags || [house])
    let lastPost = null
    let isShown = ftags.includes(tag) && follow.url && follow.id
    if (isShown) {
      imps[follow.importance] = true
    }
    if (follow.posts instanceof Array && follow.posts[0]) {
      if (isShown) {
        frago.sort(follow, follow.sortBy || sortPosts, showReposts, false)
      }
      lastPost = follow.posts[0]
    }
    ftags.forEach(k => {
      let at = tags[k]
      if (!at)
        tags[k] = at = new Date(0)
      if (lastPost && follow.importance === 0 && at < lastPost[sortPosts])
        tags[k] = lastPost[sortPosts]
    })
    return isShown
  }).sort((a, b) => {
    let sortBy = follows.settings['sort-follows']
    if (sortBy === 'title') {
      sortBy = followTitle(a).localeCompare(followTitle(b))
    } else if (sortBy) {
      sortBy = b[sortBy] > a[sortBy] ? 1 : -1
    } else {
      sortBy = lastPostTime(b, sortPosts) > lastPostTime(a, sortPosts) ? 1 : -1
    }
    return (a.importance - b.importance) || sortBy
  })
  let impa = Object.keys(imps)
  let imp = match.params.importance || (impa.length > 0 ? Math.min(...impa) : 0)
  viewable = viewable.filter(follow => (follow.importance == imp))
  let tagTabs = Object.keys(tags).filter(t => t != house).sort()
  tagTabs.unshift(house)
  let addLink = '/add?tag=' + encodeURIComponent(tag) + '&importance=' + imp
  u('a.pink').attr('href', (location.hashRouting ? '#!' : '') + addLink)

  return <div id="follows">
    <div id="tags">
      <ul>
      {tagTabs.map(t => <li class={timeDarkness(tags[t], now)}><Link to={`/tag/${encodeURIComponent(t)}`} class={t === tag && 'active'}>{t}</Link></li>)}
      </ul>
      <a href="#" class="left" oncreate={Nudge(30)}>&lsaquo;</a>
      <a href="#" class="right" oncreate={Nudge(-30)}>&rsaquo;</a>
    </div>
    <div class="sort">
      <a href="#" onclick={e => ToggleShow(e, "div")}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="6" y1="12" x2="21" y2="12"></line>
          <line x1="9" y1="18" x2="21" y2="18"></line>
        </svg>
      </a>
      <div class="drop">
        <ul>
          <li><Setting name="sort-follows">Recent Posts</Setting></li>
          <li><Setting name="sort-follows" value="createdAt">Recently Followed</Setting></li>
          <li class="sep"><Setting name="sort-follows" value="title">A to Z</Setting></li>
          <li><Setting name="mode-updates" value="updatedAt">Show Post Updates</Setting></li>
          <li><Setting name="mode-reposts" value="hide">Hide Reposts</Setting></li>
          <li><Setting name="mode-expand" value="all">Expand All</Setting></li>
          <li class="dark-mode"><Setting name="mode-theme" value="dark">Dark Mode</Setting></li>
          <li class="light-mode"><Setting name="mode-theme" value="light">Light Mode</Setting></li>
        </ul>
      </div>
    </div>
    <div id="imps">
      <ul>
      {Importances.map(sel => (sel[0] == imp ? <li class='active'>{sel[2]} {sel[1]}</li> :
        ((imps[sel[0]] || sel[0] === 0) &&
          <li>{sel[2]} <Link to={`/tag/${encodeURIComponent(tag)}?importance=${sel[0]}`}>{sel[1]}</Link></li>)))}
      </ul>
    </div>
    {viewable.length > 0 ?
      <ol>{viewable.map(follow => {
        try {
          let lastPostAt = lastPostTime(follow, sortPosts), tags = []
          let ago = timeAgo(lastPostAt, now)
          let dk = timeDarkness(lastPostAt, now)
          let linkUrl = follow.fetchesContent ? `/view/${follow.id}` : follow.url
          let id = `follow-${follow.id}`
          return <li key={id} class={dk || 'age-X'}>
            <a name={id}></a>
            <h3>
              <Link to={linkUrl}>
                <img class="favicon" src={Favicon(follows.baseHref, follow)}
                  onerror={e => e.target.src=follows.baseHref + svg['globe']} width="20" height="20" />
              </Link>
              <Link class="url" to={linkUrl}>{followTitle(follow)}</Link>
              {follow.status instanceof Array && follow.status.map(st =>
                <a class={`status status-${st.type}`} oncreate={ToggleHover} href={st.url || follow.url}
                  >{st.type === 'live' ? <span><img src={follows.baseHref + svg['rec']} width="12" /> LIVE</span> : <span><img src={follows.baseHref + svg['notepad']} width="16" /></span>}
                  <div>{st.title || st.text || html2text(st.html)}
                    {st[sortPosts] && <span class="ago">{timeAgo(st[sortPosts], now)}</span>}</div>
                </a>)}
              {ago && <span class="latest">{ago}</span>}
              <a><svg class="sparkline"
                width="120" height="20" stroke-width="2"
                oncreate={el => sparkpoints(el, follow.activity)}
                onupdate={el => sparkpoints(el, follow.activity)}></svg></a>
              <Link to={`/edit/${follow.id}`} class="edit" title="edit"><img src={follows.baseHref + images['270f']} /></Link>
            </h3>
            <div class={`extra ${follows.settings['mode-expand'] || "trunc"}`}>
              {follow.posts instanceof Array && follow.posts.length > 0 &&
                <div class="post">
                <ol class="title">{(showReposts ? follow.posts : follow.posts.filter(x => !x.author || x.author === follow.author)).
                  slice(0, follow.actualLimit ?? 10).map(f => {
                    let postAge = timeAgo(f[sortPosts], now)
                    return <li class={timeDarkness(f[sortPosts], now)}>
                      {f.author && f.author !== follow.author && <span class="author">{f.author}</span>}
                      {f.url.startsWith('id:') ? <span class="txt">{TitleTrunc(f.title)}</span> : <a href={f.url}>{TitleTrunc(f.title)}</a>}
                      {!f.index && <span class="ago">{timeAgo(f[sortPosts], now)}</span>}
                    </li>
                  })}</ol>
                  {!follow.fetchesContent && <a class="collapse" href="#"
                    onclick={e => ToggleShow(e, ".extra", "trunc")}>
                      <span class="enter">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="3" y1="3" x2="10" y2="9"></line>
                          <line x1="3" y1="13" x2="10" y2="7"></line>
                        </svg>
                      </span>
                      <span class="close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="0" y1="5" x2="6" y2="13"></line>
                          <line x1="10" y1="5" x2="4" y2="13"></line>
                        </svg>
                      </span>
                      </a>}
                </div>}
            </div>
          </li>
        } catch (e) {
          console.error(e)
          return <li><h3>{followTitle(follow) || follow.id}
            <Link to={`/edit/${follow.id}`} class="edit" title="edit"><img src={follows.baseHref + images['270f']} /></Link>
          </h3></li>
        }
      })}</ol> :
        <div class="intro">
          <h3>Ready?</h3>
          <p>Let's get Fraidycat going, yeah?</p>
          <p>Click the <Link to={addLink} class="pink" title="Add a Follow"><img src={follows.baseHref + svg['add']} width="16" /></Link> button to add someone!</p>
          <p>Or, click the <Link to="/settings" title="Settings"><img src={follows.baseHref + svg['gear']} width="16" /></Link> to import a bunch.</p>
          <p><em>Hey! Follows added to this <strong>Real-time</strong> page will highlight the tab when there are new posts!</em></p>
        </div>}
  </div>
}

const ImportFrom = (format) => {
  let imp = document.getElementById('fileImp')
  imp.name = format
  imp.click()
}

const ChangeSettings = ({ match, setup }) => (state, {follows}) => {
  return <div id="settings">
    <div class="about">
      <a href="https://fraidyc.at/"><img src={state.follows.baseHref + images['flatcat-512']} alt="Fraidycat" title="Fraidycat" /></a>
      <h2><a href="https://fraidyc.at/">fraidyc.at</a></h2>
      <p>Follow the <em>whole</em> Web.</p>
      <p class="report">Report bugs and ideas <a href="https://github.com/kickscondor/fraidycat/issues">here</a>.</p>
    </div>
    <form onsubmit={e => e.preventDefault()}>
    <input type="file" id="fileImp" style="display: none" name=""
      onchange={e => follows.importFrom(e)} />
    <h3>Import / Export</h3>
    <div>
      <p><strong>JSON:</strong>
        <button onclick={e => ImportFrom('json')}>Full Import</button>
        <button onclick={e => follows.exportTo('json')}>Full Export</button></p>
      <p class="note">This will save <em>all</em> of your Fraidycat settings.</p>
    </div>
    <div>
      <p>
        <strong>OPML:</strong>
        <button onclick={e => ImportFrom('opml')}>Import Follows</button>
        <button onclick={e => follows.exportTo('opml')}>Export Follows</button>
      </p>
      <p class="note">This will only backup your follows.</p>
    </div>
    <div>
      <p>
        <strong>HTML:</strong>
        <button onclick={e => follows.exportTo('html')}>Export Follows</button>
      </p>
      <p class="note">This is just for fun - a bookmarks list in HTML.</p>
    </div>
    </form>
  </div>
}

if (process.env.STORAGE === 'electron') {
  window.addEventListener('mouseover', e => {
    if (e.target.nodeName === "A" && e.target.href && e.target.host !== window.location.host) {
      u('footer p').text(e.target.href)
      u('footer').addClass('show')
    }
  })
  window.addEventListener('mouseout', e =>
    e.target.nodeName === "A" && u('footer').removeClass('show'))
}

export default (state, actions) => {
  let settings = window.location.pathname === "/settings.html"
  if (!state.follows.started)
    return <div id="scanner">
      <div id="logo">
        <img src={state.follows.baseHref + images['fc']} />
      </div>
      <div id="loading">
        <img src={state.follows.baseHref + webp['catspace']} alt="..." />
        <p>LOADING</p>
      </div>
    </div>

  //	
  // Report progress on follows that are currently updating.	
  //	
  let upd = state.follows.updating, urgent = state.follows.urgent
  let updDone = 0, updTotal = 0, note = null, last = new Date()	
  for (let id in upd) {	
    let f = upd[id]	
    updTotal++	
    if (f.done) {	
      updDone++	
    } else if (!note || f.startedAt < last) {	
      note = id.substring(0, id.length - 9)	
      last = f.startedAt	
    }	
  }

  // console.log(state.follows.all)
  return <div class={`theme--${state.follows.settings['mode-theme'] || "auto"}`}>
    <article>
      <header>
        <div id="menu">
          {!settings && <ul>
            {updTotal > 2 ?	
              <li id="notice">	
                <div class="progress"><div style={`width: ${Math.round((updDone / updTotal) * 100)}%`}></div></div>	
                <p>{note}</p>	
              </li> :	
              (urgent && <li id="urgent"><p><a href="#" onclick={e => {	
                e.preventDefault(); urgent.approve()}}>{urgent.note}</a></p></li>)}
            <li><Link to="/add" class="pink" title="Add a Follow"><img src={state.follows.baseHref + svg['add']} width="16" /></Link></li>
            <li><Link to="/settings" title="Settings"><img src={state.follows.baseHref + svg['gear']} width="16" /></Link></li>
          </ul>}
        </div>
        <h1><Link to="/"><img src={state.follows.baseHref + images['fc']} alt="Fraidycat" title="Fraidycat" /></Link></h1>
      </header>
      <section>
        <Switch>
          <Route path="/settings" render={ChangeSettings} />
          <Route path="/add" render={AddFollow} />
          <Route path="/add-feed" render={AddFeed} />
          <Route path="/edit/:id" render={EditFollowById} />
          <Route path="/tag/:tag" render={ListFollow} />
          <Route render={settings ? ChangeSettings : ListFollow} />
        </Switch>
      </section>
      <footer>
        <p>&nbsp;</p>
      </footer>
    </article>
  </div>
}
