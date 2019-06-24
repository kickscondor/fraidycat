import { getIndexById } from './util'
import { h } from 'hyperapp'
import { Link, Route, Switch } from '@kickscondor/router'
import logo from '../images/fc.png'

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
      <p class="note">(Leave empty to use <span>{follow.actual_title}</span>)</p>
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
    {FollowForm({})}
  </div>
}

const ListFollow = ({ match }) => ({follows}, actions) => {
  let imp = null
  return <div id="follows">
    <div id="labels"></div>
    <ol>{follows.all.map(follow => <li><a class="url" href={follow.url}>{follow.title}</a></li>)}</ol>
  </div>

//    <ol>{follows.map(follow => {
//      // let ago = distance_of_time_short(follow.latest_at)
//      let daily = follow.importance < 7
//      if (follow.importance != imp) {
//        imp = follow.importance
//        // hdr = XYZ::Follow::IMPORTANCES.assoc(follow[:importance])
//        // <li class="importance"><span><%= hdr[1] %></span></li>
//      }
//
//      return <li class={`age-${ago[-1]}`}><h3>
//        <a href={follow.url}
//        <img class="favicon" src="<%= (follow[:photo] || "//" + follow[:url] + "/favicon.ico").gsub(/^https?:\/\//, '//') %>"
//          onError="image_broken(this)" width="20" height="20">
//        </a>
//        <a class="url" href="http://<%= follow[:url] %>"><%=h follow[:title] %></a>
//        <span class="latest" title="<%= distance_of_time_in_words(follow[:latest_at]) %>"><%= ago %></span>
//        <span title="graph of the last <%= daily ? 'two' : 'six' %> months">
//          <svg class="sparkline sparkline-<%= daily ? "d" : "w" %>"
//            width="120" height="20" stroke-width="2"
//            data-points="<%= follow[daily ? :sparkline_days : :sparkline_weeks] %>"></svg></span>
//          <a class="edit" href="/edit/<%= follow[:url] %>" title="edit"><img src="/images/270f.png"></a>
//        </h3>
//        <div class="extra trunc">
//          <div class="post"><%= follow[:latest_title] %>
//            <p class="collapse"><a href="#">&#x2022;&#x2022;&#x2022;</a></p>
//          </div>
//          <div class="note"><%= follow[:description] %></div>
//          <a href="http://<%= follow[:latest_url] %>"></a>
//        </div>
//        <p class="labels"><%= follow[:tags] %></p>
//    </li>
//    })}</ol>
}

export default (state, actions) =>
  (state.follows.started &&
    <article>
      <header>
        <Link to="/"><img src={logo} alt="Fraidycat Logo" title="Fraidycat" /></Link>
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
          <Route path="/edit/:id" render={EditFollow} />
          <Route path="/tag/:tag" render={ListFollow} />
        </Switch>
      </section>
    </article>)
