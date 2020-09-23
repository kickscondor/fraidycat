function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

let params = new URLSearchParams(location.search)
let feed = params.get("feed")
chrome.tabs.query({active: true, currentWindow: true}, tabs => {
  let u = tabs[0].url
  document.getElementById('add').firstChild.href += "?url=" + encodeURIComponent(u)
  try {
    feed = JSON.parse(feed)
    let avatar = "", title = "", link = "", desc = "", sel = ""
    if (feed.photos?.avatar) {
      avatar = "<div id='avatar'><img src='" + encodeURI(feed.photos.avatar) + "'></div>"
    }
    if (feed.title) {
      title = "<h1>" + escapeHtml(feed.title) + "</h1>"
    }
    if (feed.description) {
      desc = "<p>" + escapeHtml(feed.description) + "</p>"
    }
    if (feed.sources?.length > 1) {
      for (let i = 0; i < feed.sources.length; i++) {
        let src = feed.sources[i]
        sel += "<div class='source'><input type='radio' value='" + encodeURIComponent(src.url) + "' " +
          "name='sources' id='source" + i + "'> <label for='source" + i + "'>" +
          escapeHtml(src.title) + "</label><br><span>" +
          escapeHtml(src.url) + "</span></div>"
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
    document.getElementById('card').innerHTML = avatar + title +
      "<h2>" + escapeHtml((new URL(u)).hostname) + "</h2>" + desc + sel
  } catch {}
})
