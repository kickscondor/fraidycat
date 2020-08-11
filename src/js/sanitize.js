module.exports = function(el, fn) {
  let san = sanitize(el, fn)
  let frag = document.createElement('div')
  frag.appendChild(san)
  return frag.innerHTML
}

function sanitize(el, fn) {
  for (var i = el.childNodes.length - 1; i > -1; i--) {
    sanitize(el.childNodes[i], fn)
  }

  if (fn(el) !== false) {
    return el
  } else if (el.parentNode) {
    removeDomLayer(el)
    return
  } else {
    return domArray(el.childNodes)
  }
}

function removeDomLayer(el) {
  while (el.childNodes.length) {
    el.parentNode.insertBefore(el.lastChild, el)
  }
  el.parentNode.removeChild(el)
}

function domArray(arr) {
  if (arr.length == 0) return
  if (arr.length == 1) return arr[0]

  var frag = document.createDocumentFragment()
  while (arr.length) {
    frag.appendChild(arr[0])
  }
  return frag
}

