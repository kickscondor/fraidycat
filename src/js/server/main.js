const { Worker, isMainThread, threadId, parentPort } = require('worker_threads')

const fs = require('fs')
const { jsonDateParser } = require("json-date-parser")
const os = require('os')
const path = require('path')
const uws = require('uWebSockets.js')

const platform = require('./platform')
const storage = require('./storage')

function ab2str(buf) {                                                                                      
  return String.fromCharCode.apply(null, new Uint8Array(buf));                                              
}

function decode (buf) {
  return JSON.parse(Buffer.from(buf), jsonDateParser)
}

function encode (obj) {
  return JSON.stringify(obj)
}

if (isMainThread) {
  if (!platform.isLinux || process.env.DISPLAY) {
    const SysTray = require('systray').default
    const open = require('open')

    const icon = fs.readFileSync(path.join(__dirname,
      `images/flatcat-32.${platform.isWindows === 'win32' ? 'ico' : 'png'}`)).
      toString('base64')
    
    const tray = new SysTray({
      menu: {
        icon,
        title: 'Fraidycat',
        tooltip: 'Fraidycat',
        items: [{
          title: "Your Fraidycat Page",
          tooltip: "Launch",
          checked: false,
          enabled: true
        }, {
          title: "Exit Fraidycat",
          tooltip: "Exit",
          checked: false,
          enabled: true
        }]
      },
      debug: false,
      copyDir: true
    })

    async function openHomePage() {
      await open("https://fraidyc.at/2/")
    }

    tray.onClick(action => {
      switch (action.item.tooltip) {
        case 'Launch':
          openHomePage()
          break
        case 'Exit':
          tray.kill()
      }
    })

    tray.onExit(() => {
      setTimeout(() => process.exit(0), 1000)
    })
  };

  (async function() {
    //
    // Setup database
    //
    const local = await storage({profile: platform.profile})
    await local.init()
    const workers = os.cpus().map(() => {
      //
      // Create worker and pass messages from the WebSocket
      // to the backend.
      //
      const worker = new Worker(__filename)
      worker.on('message', msg => {
        if (msg.port) {
          local.addPort(msg.port)
          msg.port.on('message', pm => {
            let obj = decode(pm)
            local.log(obj)
            local.dispatch(obj.action, obj.data, msg.port)
          })
          msg.port.on('close', () => {
            local.removePort(msg.port)
            local.log('port closed')
          })
        }
      })
      return worker
    })

    //
    // Setup Tor tunnel
    //
    const tbb = require('@kickscondor/granax/script/download-tbb')
    tbb.install(err => {
      if (err) {
        return local.error(err)
      }

      const tor = require('@kickscondor/granax')();
      tor.on('ready', async () => {
        let opts = await local.localGet('tor-options', {})
        tor.createHiddenService('127.0.0.1:7547', opts, (err, result) => {
          if (result.privateKey) {
            local.localSet('tor-options', result.privateKey)
          }
          local.onionId = result.serviceId
          console.info(`Tor URL: ${result.serviceId}.onion`)
        })
      })

      tor.on('error', err => local.error(err))

      //
      // Cleanup workers and processes on exit
      //
      // const cleanup = function () {
      //   workers.forEach((worker) => {
      //     worker.postMessage('cleanup')
      //   })
      // }
      // process.on('SIGTERM', cleanup)
      // process.on('SIGINT', cleanup)
      process.on('exit', code => {
        tor.shutdown(() => local.info('Tor process shutdown'))
      })
    })

  })();

} else {

  const app = uws.App();

  let staticFiles = {}
  fs.readdir("build/frontend", (err, files) => {
    if (!err) {
      for (let f of files) {
        fs.stat("build/frontend/" + f, (err, stats) => {
          if (!err) {
            staticFiles[f] = stats.size
          }
        })
      }
    }
  })

  function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }

  function pipeStreamOverResponse(res, readStream, totalSize) {
    readStream.on('data', chunk => {
      const ab = toArrayBuffer(chunk)
      let lastOffset = res.getWriteOffset()
      let [ok, done] = res.tryEnd(ab, totalSize)
      if (done) {
        readStream.destroy()
      } else if (!ok) {
        readStream.pause()

        res.ab = ab
        res.abOffset = lastOffset
        res.onWritable(offset => {
          let [ok, done] = res.tryEnd(res.ab.slice(offset - res.abOffset), totalSize)
          if (done) {
            readStream.destroy()
          } else if (ok) {
            readStream.resume()
          }

          return ok
        })
      }
    })
  }

  function contentTypeOf(path) {
    if (path.endsWith(".html"))
      return "text/html"
    if (path.endsWith(".js"))
      return "application/javascript"
    if (path.endsWith(".css"))
      return "text/css"
    if (path.endsWith(".png"))
      return "image/png"
    if (path.endsWith(".svg"))
      return "image/svg+xml"
    if (path.endsWith(".webp"))
      return "image/webp"
    return "application/octet-stream"
  }

  function staticFile(res, path) {
    let fname = path.substr(1)
    let fsize = staticFiles[fname]
    let reads = null
    res.onAborted(() => {
      res.aborted = true
      if (reads) {
        reads.destroy()
        reads = null
      }
    })
    if (fsize) {
      reads = fs.createReadStream("build/frontend/" + fname)
      if (!res.aborted) {
        res.writeHeader('Content-Type', contentTypeOf(fname))
        res.writeHeader('Cache-Control', fname.endsWith('.html') ? 'no-cache' : 'public, max-age=86400')
        pipeStreamOverResponse(res, reads, fsize)
      }
    } else if (!res.aborted) {
      res.writeStatus('404 Not Found')
      res.end()
    }
  }

  app.get('/', (res, req) => staticFile(res, '/index.html'))

  //
  // API
  //
  function cors(res, req, outputFail = true) {
    let origin = req.getHeader('origin')
    let access = true
    if (origin) {
      access = false
      if (origin === 'https://fraidyc.at' && !res.aborted) {
        res.writeHeader('Access-Control-Allow-Origin', origin)
        res.writeHeader('Access-Control-Allow-Credentials', 'true')
        res.writeHeader('Vary', 'Origin')
        access = true
      }
    }
    if (outputFail && !access && !res.aborted) {
      res.writeStatus('204 No Content')
      res.end()
    }
    return access
  }

  function apiCall(fn) {
    return (res, req) => {
      res.onAborted(() => res.aborted = true)
      if (!cors(res, req))
        return

      let obj = fn(req)
      if (!res.aborted) {
        res.writeHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(obj))
      }
    }
  }

  //
  // Handle CORS preflight headers
  //
  app.options('/v1/*', (res, req) => {
    if (!res.aborted)
      res.writeStatus('204 No Content')
    cors(res, req, false)
    if (!res.aborted)
      res.end()
  })

  //
  // Get the server info.
  //
  app.get('/v1/info', apiCall(req => {
    return {server: 'Fraidycat', version: '1.0'}
  }))

  //
  // Get this user's synced settings.
  //
  app.get('/v1/settings', apiCall(req => {
  }))

  //
  // Set this user's synced settings.
  //
  app.post('/v1/settings', apiCall(req => {
  }))

  //
  // Get this user's follows.
  //
  app.get('/v1/follows', apiCall(req => {
  }))

  //
  // Add a new follow.
  //
  app.post('/v1/follows', apiCall(req => {
  }))

  //
  // Get detailed info for a follow.
  //
  app.get('/v1/follow/:id', apiCall(req => {
  }))

  //
  // Update settings for a follow.
  //
  app.put('/v1/follow/:id', apiCall(req => {
  }))

  //
  // Fallthrough to the local files.
  //
  app.get('/*', (res, req) => staticFile(res, req.getUrl()))

  //
  // Receive events for a user.
  //
  app.ws('/v1', {
    /* Options */
    compression: uws.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: process.env.TIMEOUT || 16,

    /* Handlers */
    open: (ws) => {
      let address = ab2str(ws.getRemoteAddressAsText())
      let { port1, port2 } = new MessageChannel()
      ws['port'] = port2
      port2.on('message', msg => {
        try {
          ws.send(msg)
        } catch (e) {
          console.log(e)
        }
      })
      parentPort.postMessage({port: port1}, [port1])
    },

    message: (ws, msg, isBinary) => {
      let port = ws['port']
      if (port) {
        port.postMessage(msg)
      }
    },

    close: (ws, code, message) => {
      let port = ws['port']
      if (port) {
        port.close()
      }
    }
  })

  app.listen(7547, sock => {
    console.log("Started server")
  })
}
