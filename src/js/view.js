import { h } from 'hyperapp'
import { Link, Route, Switch } from '@kickscondor/router'

const Importances = [
  [0,   'Real-time'],
  [1,   'Daily'],
  [7,   'Weekly'],
  [30,  'Monthly'],
  [365, 'Year']
]

const FeedForm = (follow) => (state, actions) =>
  <form class="follow" onsubmit={e => e.preventDefault()}>
    {!follow.url &&
      <div>
        <label for="url">URL</label>
        <input type="text" id="url" name="url" value={follow.url} autocorrect="off" autocapitalize="none"
          oninput={e => follow.url = e.target.value} />
      </div>}

    <div>
      <label for="username">Importance</label> 
      <select id="username" name="importance" onchange={e => follow.importance = e.target.selectedIndex}>
      {Importances.map(imp => 
        <option value={imp[0]} selected={imp[0] == follow.importance}>{imp[1]}</option>)}
      </select>
    </div>

    <div>
      <label for="keywords">Label(s) &mdash; separate with spaces</label>
      <input type="text" id="keywords" value={follow.keywords ? follow.keywords.join(' ') : ''}
        oninput={e => follow.keywords = e.target.value.split(/\s+/)} />
    </div>

    <div>
      <label for="title">Title</label>
      <input type="text" id="title" value={follow.title}
        oninput={e => follow.title = e.target.value} />
      <p class="note">(Leave empty to use <span>{follow.actual_title}</span>)</p>
    </div>

    <button onclick={_ => actions.follows.save(follow)}>Save</button>
    {follow.url && <button class="delete" onclick={_ => actions.follows.remove(follow)}>Delete This</button>}
  </form>

const EditFeed = ({ match }) => (state, actions) => {
  let follow = {url: "https://www.kickscondor.com", importance: 7,
    keywords: "wiki test", actual_title: "Kicks Condor", title: "KICKS!"}
  return <div id="edit-feed">
    <h2>Edit</h2>
    <p>URL: {follow.url}</p>
    {FeedForm(follow)}
  </div>
}

const AddFeed = ({ match }) => (state, actions) => {
  return <div id="add-feed">
    <h2>Follow</h2>
    <p>What blog, wiki or social account do you want to follow?</p>
    {FeedForm({})}
  </div>
}

const Home = ({ match }) => (state, actions) => {
  let follows = [], imp = null
  return <div id="follows">
    <div id="labels"></div>
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
//        <p class="labels"><%= follow[:keywords] %></p>
//    </li>
//    })}</ol>
}

export default (state, actions) =>
  <div>
    <div id="menu">
      <ul>
        <li><a href="/add" title="Add a Follow">&#xff0b;</a></li>
        {true ? "" : <li><a href="/logout" title="Logout">&#x1f6aa;</a></li>}
      </ul>
    </div>

    <Switch>
      <Route path="/" render={Home} />
      <Route path="/add" render={AddFeed} />
      <Route path="/edit/:id" render={EditFeed} />
    </Switch>
  </div>
