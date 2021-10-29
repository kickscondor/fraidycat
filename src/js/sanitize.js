const { DOMImplementation, XMLSerializer } = require('@xmldom/xmldom')

module.exports = function(el, fn) {
  let san = sanitize(el, fn)
  return (new XMLSerializer()).serializeToString(san)
}

function sanitize(el, fn) {
  if (el.hasChildNodes()) {
    for (var i = el.childNodes.length - 1; i > -1; i--) {
      sanitize(el.childNodes[i], fn)
    }
  }

  if (fn(el) !== false) {
    return el
  } else if (el.parentNode) {
    removeDomLayer(el)
    return
  } else {
    return domArray(el)
  }
}

function removeDomLayer(el) {
  let child = el.firstChild
  while (child) {
    let child2 = child.nextSibling
    el.parentNode.insertBefore(child, el)
    child = child2
  }
  el.parentNode.removeChild(el)
}

function domArray(el) {
  if (!el.hasChildNodes()) return
  if (el.childNodes.length == 1) return el.childNodes.item(0)

  let doc = (new DOMImplementation()).createDocument()
  let frag = doc.createDocumentFragment()
  let child = el.firstChild
  while (child) {
    let child2 = child.nextSibling
    frag.appendChild(child)
    child = child2
  }
  return frag
}

