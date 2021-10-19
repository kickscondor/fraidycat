//
// Call out to the API for storage.
//
import { jsonDateParser } from "json-date-parser"

//
// TODO: Love Phoenix's idea to use EventStream for incoming stuff and to
// use traditional REST for outgoing. Also seems better for error-handling.
//
class FrontendStorage {
  constructor(id) {
    this.id = id 
    this.clientFn = null
    this.ws = null
    this.wsq = []
    let connect = () => {
      if (this.ws === null) {
        let ws = new WebSocket("ws://" + window.location.host + "/v1")
        this.ws = ws
        ws.onopen = ev => {
          this.wsq.map(msg => ws.send(msg))
          this.wsq = []
        }
        ws.onmessage = ev => {
          let msg = this.decode(ev.data)
          if (msg.action === "fraidycat.updated") {
            if (this.clientFn) {
              this.clientFn(msg.data)
            }
          }
        }
        ws.onerror = ev => {
          console.log(ev)
          // this.ws = null
          ws.close()
        }
        ws.onclose = ev => {
          this.ws = null
        }
      }
    }
    setInterval(connect, 1000)
  }

  //
  // JSON convenience.
  //
  encode(obj) {
    return JSON.stringify(obj)
  }

  decode(str) {
    return JSON.parse(str, jsonDateParser)
  }

  //
  // Messaging functions.
  //
  async client(fn) {
    this.clientFn = fn
  }

  command(action, data) {
    let obj = this.encode({action: "fraidycat." + action, data})
    if (this.ws) {
      this.ws.send(obj)
    } else {
      this.wsq.push(obj)
      // this.clientFn({op: 'error', message: 'Fraidycat is trying to reconnect right now.'})
    }
  }
}

module.exports = async function () {
  let session = Math.random().toString(36)
  return new FrontendStorage(session)
}
