import { getIndexById } from './util'
import { h } from 'hyperapp'
import { Link, Route, Switch } from '@kickscondor/router'
import globe from '../images/globe.svg'
import images from '../images/*.png'
const url = require('url')

import u from 'umbrellajs'
import sparkline from '@fnando/sparkline'

const Importances = [
  [0,   'Real-time'],
  [1,   'Daily'],
  [7,   'Weekly'],
  [30,  'Monthly'],
  [365, 'Year']
]

const FollowForm = (follow) => (_, {follows}) =>
  <form class="follow" onsubmit={e => e.preventDefault()}>
    {!follow.url &&
      <div>
        <label for="url">URL</label>
        <input type="text" id="url" name="url" value={follow.url} autocorrect="off" autocapitalize="none"
          oninput={e => follow.url = e.target.value} />
      </div>}

    <div>
      <label for="username">Importance</label> 
      <select id="username" name="importance" onchange={e => follow.importance = e.target.options[e.target.selectedIndex].value}>
      {Importances.map(imp => 
        <option value={imp[0]} selected={imp[0] == follow.importance}>{imp[1]}</option>)}
      </select>
    </div>

    <div>
      <label for="tags">Tag(s) &mdash; separate with spaces</label>
      <input type="text" id="tags" value={follow.tags ? follow.tags.join(' ') : ''}
        oninput={e => follow.tags = e.target.value.split(/\s+/)} />
      <p class="note">(If left blank, tag is assumed to be 'main'&mdash;the main listing.)</p>
    </div>

    <div>
      <label for="title">Title</label>
      <input type="text" id="title" value={follow.title}
        oninput={e => follow.title = e.target.value} />
      <p class="note">(Leave empty to use <span>{follow.actualTitle || "the title loaded from the site"}</span>.)</p>
    </div>

    <button onclick={_ => follows.save(follow)}>Save</button>
    {follow.url && <button class="delete" onclick={_ => follows.remove(follow)}>Delete This</button>}
  </form>

const EditFollow = ({ match }) => ({follows}) => {
  let index = getIndexById(follows.all, match.params.id)
  let follow = follows.all[index]
  return <div id="edit-feed">
    <h2>Edit</h2>
    <p>URL: {follow.url}</p>
    {FollowForm(follow)}
  </div>
}

const AddFollow = ({ match }) => () => {
  return <div id="add-feed">
    <h2>Follow</h2>
    <p>What blog, wiki or social account do you want to follow?</p>
    {FollowForm({importance: 0})}
  </div>
}

const AddFeed = () => ({follows}, actions) => {
  let {list, site} = follows.feeds
  return <div id="feed-select">
    <h2>Select a Feed</h2>
    <p>{site.title || site.actualTitle} ({site.url}) has several feeds:</p>
    <ul>
    {list.map(feed =>
      <li><input type="checkbox" onclick={e => feed.selected = e.target.checked} value={feed.href} /> {feed.title}</li>)}
    </ul>
    <button onclick={_ => actions.follows.subscribe(follows.feeds)}>Subscribe</button>
  </div>
}

function timeAgo(from_time, to_time) {
  from_time = Math.floor(from_time / 1000)
  to_time = Math.floor(to_time / 1000)
  let mins = Math.round(Math.abs(to_time - from_time)/60)

  if (mins >= 0 && mins <= 1) 
    return '1m'
  if (mins >= 2 && mins <= 45)
    return mins + 'm'
  if (mins >= 46 && mins <= 90)
    return '1h'
  if (mins >= 91 && mins <= 1440)
    return Math.round(mins / 60) + 'h'
  if (mins >= 1441 && mins <= 2880)
    return '1d'
  if (mins >= 2881 && mins <= 43220)
    return Math.round(mins / 1440) + 'd'
  if (mins >= 43201 && mins <= 86400)
    return '1M'
  if (mins >= 86401 && mins <= 525960)
    return Math.round(mins / 43200) + 'M'
  if (mins >= 525961 && mins <= 1051920)
    return '1Y'
  return Math.round(mins / 525600) + 'Y'
}

function sparkpoints(el, ary, daily) {
  let points = [], len = 60
  if (daily) {
    points = ary.slice(0, 60)
    len = points.length
  } else {
    len = Math.ceil(len / 3)
    for (let i = 0; i < len; i++) {
      let x = i * 3
      points[i] = ary[x] + (ary[x + 1] || 0) + (ary[x + 2] || 0)
    }
  }
  if (points.every(x => x == 0))
    len = 0
  el.setAttribute('width', len * 2)
  if (len > 0)
    sparkline(el, points.reverse())
}

const ListFollow = ({ match }) => ({follows}, actions) => {
  let imp = null
  let now = new Date()
  let tag = match.params ? match.params.tag : "main"
  return <div id="follows">
    <div id="labels"></div>
    <ol>{follows.all.filter(follow => (follow.tags || ["main"]).includes(tag)).
      map(follow => {
        let lastPost = follow.posts[0], tags = []
        let ago = lastPost && timeAgo(lastPost.updatedAt, now)
        let daily = follow.importance < 7
        if (follow.importance != imp) {
          imp = follow.importance
          let sel = Importances.find(x => x[0] == imp)
          if (sel) {
            tags.push(<li class="importance"><span>{sel[1]}</span></li>)
          }
        }

        tags.push(<li class={`age-${ago ? ago.slice(-1) : "X"}`}>
          <h3>
            <a href={follow.url}>
              <img class="favicon" src={follow.photo || url.resolve(follow.url, '/favicon.ico')}
                onerror={e => e.target.src=globe} width="20" height="20" />
            </a>
            <a class="url" href={follow.url}>{follow.title || follow.actualTitle}</a>
            {ago && <span class="latest">{ago}</span>}
            <span title={`graph of the last ${daily ? 'two' : 'six'} months`}>
              <svg class={`sparkline sparkline-${daily ? "d" : "w"}`}
                width="120" height="20" stroke-width="2"
                oncreate={el => sparkpoints(el, follow.activity, daily)}></svg></span>
              <a class="edit" href={`/edit/${follow.id}`} title="edit"><img src={images['270f']} /></a>
          </h3>
          <div class="extra trunc">
            <div class="post">{lastPost && <span class="title">{lastPost.title}</span>}
              <a class="collapse" href="javascript:;"
                onclick={e => u(e.target).closest(".extra").toggleClass("trunc")}>&#x2022;&#x2022;&#x2022;</a>
            </div>
            <div class="note">{follow.description}</div>
            <a href={follow.url}></a>
          </div>
        </li>)
        return tags
      })}</ol>
  </div>
}

export default (state, actions) =>
  (state.follows.started &&
    <article>
      <header>
        <Link to="/"><img src={images['fc']} alt="Fraidycat Logo" title="Fraidycat" /></Link>
      </header>
      <section>
        <div id="menu">
          <ul>
            <li><Link to="/add" title="Add a Follow">&#xff0b;</Link></li>
            {true ? "" : <li><Link to="/logout" title="Logout">&#x1f6aa;</Link></li>}
          </ul>
        </div>

        <Switch>
          <Route path="/" render={ListFollow} />
          <Route path="/add" render={AddFollow} />
          <Route path="/add-feed" render={AddFeed} />
          <Route path="/edit/:id" render={EditFollow} />
          <Route path="/tag/:tag" render={ListFollow} />
        </Switch>
      </section>
    </article>)
