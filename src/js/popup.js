import u from '@kickscondor/umbrellajs'

let params = new URLSearchParams(location.search)
let feed = params.get("feed")
chrome.tabs.query({active: true, currentWindow: true}, tabs => {
  let turl = tabs[0].url
  document.getElementById('add').firstChild.href += "?url=" + encodeURIComponent(turl)
  try {
    feed = JSON.parse(feed)
    let card = u('#card').empty()
    if (feed.photos?.avatar) {
      card.append(u("<img>").attr({src: feed.photos.avatar}).wrap("<div id='avatar'>"))
    }
    if (feed.title) {
      card.append(u("<h1>").text(feed.title))
    }
    card.append(u("<h2>").text((new URL(turl)).hostname))
    if (feed.description) {
      card.append(u("<p>").text(feed.description))
    }
    if (feed.sources?.length > 1) {
      for (let i = 0; i < feed.sources.length; i++) {
        let src = feed.sources[i]
        let radio = u("<input type='radio' name='sources'>").attr({value: src.url, id: `source${i}`})
        let label = u("<label>").attr({for: `source${i}`}).text(src.title)
        let span = u("<span>").text(src.url)
        card.append(u("<div class='source'>").append(radio).append(" ").append(label).append("<br>").append(span))
      }
    }
		let links = document.getElementsByTagName('a')
		for (let i = 0; i < links.length; i++) {
			links[i].addEventListener('click', e => {
				if (e.target === document.getElementById('addlink')) {
					let radios = document.getElementsByTagName('input')
					for (let j = 0; j < radios.length; j++) {
						if (radios[j].checked) {
							e.target.href = "https://fraidyc.at/s/#!/add?url=" + radios[j].value
						}
					}
				}
				setTimeout(() => window.close(), 100)
			})
		}
  } catch {}
})
