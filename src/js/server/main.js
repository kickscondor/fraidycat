// const cluster = require('cluster')
// const numCPUs = require('os').cpus().length
// 
// if (cluster.isMaster) {
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }
//   cluster.on('exit', (worker, code, signal) => {
//     console.log(`worker ${worker.process.pid} died`)
//   })
//   return
// }
const fs = require('fs')
const ngrok = require('ngrok')
const path = require('path')
const uws = require('uWebSockets.js')

if (__dirname.startsWith('/snapshot')) {
  const SysTray = require('systray').default
  const open = require('open')

  async function openHomePage() {
    await open("https://fraidyc.at/s/")
  }

  const icon = fs.readFileSync(path.join(__dirname, `../../images/flatcat-32.${process.platform === 'win32' ? 'ico' : 'png'}`)).toString('base64')
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

  tray.onClick(action => {
    console.log(action)
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
}

const app = uws.App()

app.get('/', (res, req) => {
  res.writeHeader('Content-Type', 'text/html')
  res.end("HELLO!")
})

//
// API
//
function cors(res, req, outputFail = true) {
  let origin = req.getHeader('origin')
  let access = true
  if (origin) {
    access = false
    if (origin === 'https://fraidyc.at') {
      res.writeHeader('Access-Control-Allow-Origin', origin)
      res.writeHeader('Access-Control-Allow-Credentials', 'true')
      res.writeHeader('Vary', 'Origin')
      access = true
    }
  }
  if (outputFail && !access) {
    res.writeStatus('204 No Content')
    res.end()
  }
  return access
}

function apiCall(fn) {
  return (res, req) => {
    if (!cors(res, req))
      return

    let obj = fn(req)
    res.writeHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  }
}

//
// Handle CORS preflight headers
//
app.options('/v1/*', (res, req) => {
  res.writeStatus('204 No Content')
  cors(res, req, false)
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
app.get('/v1/settings', (res, req) => {
})

//
// Set this user's synced settings.
//
app.post('/v1/settings', (res, req) => {
})

//
// Get this user's follows.
//
app.get('/v1/follows', (res, req) => {
})

//
// Add a new follow.
//
app.post('/v1/follows', (res, req) => {
})

//
// Get detailed info for a follow.
//
app.get('/v1/follow/:id', (res, req) => {
  res.writeHeader('Content-Type', 'text/html')
  res.end(`HELLO! ${req.getParameter(0)}`)
})

//
// Update settings for a follow.
//
app.put('/v1/follow/:id', (res, req) => {
})

//
// Receive events for a user.
//
app.ws('/v1', (res, req) => {
  res.cork(() => {
    res.writeHeader('Cache-Control', 'no-cache')
    res.writeHeader('Content-Type', 'text/event-stream')
  })
})

app.listen(7547, sock => {
  console.log("Started server")
  // ngrok.connect(7547).then(url => {
  //   console.log(`Running on ${url}`)
  // })
})

// openHomePage()
