const { Worker, isMainThread, threadId } = require('worker_threads')

const fs = require('fs')
const os = require('os')
const path = require('path')
const platform = require('./platform')
const storage = require('./storage')
const upnp = require('nat-upnp')
const uws = require('uWebSockets.js')

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
  };

  (async function() {
    const local = await storage({profile: platform.profile})
    await local.setup()
    os.cpus().forEach(() => new Worker(__filename))
  })();

  const tor = require('@pointnetwork/granax')();
  tor.on('ready', function() {
    // Service URL: wztce3wkojaako7knpcconj7togcmse73zkru2izsu6kts2wxpcqkcid.onion
    let opts = {
      keyType: 'ED25519-V3',
      keyBlob: 'KFBn2E7zc/P1CEPs8GMLIhvp4Neo+cc9T0zZtU4e4kWKcKPM9LrL1u8c5/je/4PgdP2NdBjp5q80OnQBh0coUQ'
    }
    tor.createHiddenService('127.0.0.1:7547', opts, (err, result) => {
      console.info(`Service URL: ${result.serviceId}.onion`)
      console.info(`Private Key: ${result.privateKey}`)
    })
  })

  tor.on('error', function(err) {
    console.error(err);
  })

} else {

  const app = uws.App();

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
  app.ws('/v1', {
    /* Options */
    compression: uws.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: process.env.TIMEOUT || 10,

    /* Handlers */
    message: (ws, msg, isBinary) => {
      let u8 = new Uint8Array(msg)
      // local.server(msg => local[msg.action](msg.data, msg.sender))
    }
  })

  app.listen(7547, sock => {
    console.log("Started server")
  })
}
