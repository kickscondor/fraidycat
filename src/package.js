const decompress = require('decompress')
const needle = require('needle')
const fs = require('fs')
const fg = require('fast-glob')
const koalaesce = require('koalaesce')
const os = require('os')
const path = require('path')
const url = require('url')

const cacheDir = path.join(os.homedir(), '.exexe')
const output = process.argv[2]
const platform = process.env.PLATFORM || process.platform
const env = {arch: process.env.ARCH || process.arch,
  platform: (platform == 'win' ? 'win32' : platform),
  platform_full: (platform == 'win' ? 'windows' : platform),
  vmod: process.versions.modules, exe: (platform == 'win' ? '.exe' : '')}
const tarExt = (platform == 'win' ? '.zip' : '.tar.gz')
const nodeBinaryUrl = process.release.sourceUrl.replace('.tar.gz',
  '-' + platform + '-' + env.arch + tarExt)
const pkg = JSON.parse(fs.readFileSync('package.json'))

function mkpdir(outputPath) {
  let outputDir = path.dirname(outputPath)
  try { fs.mkdirSync(outputDir, {recursive: true}) } catch {}
}

async function streamWithProgress(response, writer, progressCallback) {
  let length = parseInt(response.headers.get('Content-Length' || '0'), 10)
  let reader = response.body.getReader()
  let bytesDone = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) {
      if (progressCallback != null) {
        progressCallback(length, 100);
      }
      return;
    }

    const chunk = result.value;
    if (chunk == null) {
      throw Error('Empty chunk received during download');
    } else {
      writer.write(Buffer.from(chunk));
      if (progressCallback != null) {
        bytesDone += chunk.byteLength;
        const percent = length === 0 ? null : Math.floor(bytesDone / length * 100);
        progressCallback(bytesDone, percent);
      }
    }
  }
}

async function download(dUrl, fn) {
  let localPath = path.join(cacheDir, path.basename(new URL(dUrl).pathname))
  if (fs.existsSync(localPath))
    return localPath

  return new Promise((resolve, reject) => {
    let dest = fs.createWriteStream(localPath)
    mkpdir(localPath)
    needle.get(dUrl).pipe(dest).
      on('done', () => resolve(localPath))
  })
}

(async function () {
  //
  // Copy all local assets into the output directory.
  //
  if (pkg.assets) {
    for (let asset of pkg.assets) {
      let source = asset.source.replace(/\$\{(.+?)\}/g,
        (_, p1) => koalaesce.getNamed(env, p1))
      let entries = fg.sync(source)
      for (let entry of entries) {
        let outputPath = path.join(output,
          asset.dest ? asset.dest : (asset.dir ? path.join(asset.dir, path.basename(entry)) : entry))
        console.log(outputPath)
        mkpdir(outputPath)
        fs.copyFileSync(entry, outputPath)
      }
    }
  }

  //
  // Ensure we've got the appropriate Node binary.
  //
  let nodeBinaryPath = await download(nodeBinaryUrl, () => {})
  let nodeDir = path.basename(nodeBinaryPath, tarExt)
  let nodeExe = null
  await decompress(nodeBinaryPath, cacheDir, {filter: file => {
    if (file.path.startsWith(nodeDir + '/bin/node') || file.path.startsWith(nodeDir + '/node.exe')) {
      nodeExe = file.path
      return true
    }
  }})
  fs.copyFileSync(path.join(cacheDir, nodeExe),
    path.join(output, path.basename(nodeExe)))

  if (platform === 'darwin') {
    // let appdmg = require('appdmg')
    // let dmg = appdmg({target: 'dist/Fraidycat-' + pkg.version + '.dmg',
    //   basepath: __dirname, specification: {
    //     title: pkg.productName,
  }
})()
