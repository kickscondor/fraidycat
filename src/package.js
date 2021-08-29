const decompress = require('decompress')
const fetch = require('node-fetch')
const fs = require('fs')
const fg = require('fast-glob')
const koalaesce = require('koalaesce')
const os = require('os')
const path = require('path')
const url = require('url')

const cacheDir = path.join(os.homedir(), '.exexe')
const output = process.argv[2]
const arch = process.env.ARCH || process.arch
const platform = process.env.PLATFORM || process.platform
const tarExt = (platform == 'win' ? '.zip' : '.tar.gz')
const nodeBinaryUrl = process.release.sourceUrl.replace('.tar.gz',
  '-' + platform + '-' + arch + tarExt)
const pkg = JSON.parse(fs.readFileSync('package.json'))

function mkpdir(outputPath) {
  let outputDir = path.dirname(outputPath)
  try { fs.mkdirSync(outputDir, {recursive: true}) } catch {}
}

async function download(dUrl) {
  let localPath = path.join(cacheDir, path.basename(new URL(dUrl).pathname))
  if (!fs.existsSync(localPath)) {
    let res = await fetch(dUrl)
    mkpdir(localPath)
    let dest = fs.createWriteStream(localPath)
    res.body.pipe(dest)
  }
  return localPath
}

(async function () {
  //
  // Copy all local assets into the output directory.
  //
  if (pkg.assets) {
    for (let asset of pkg.assets) {
      let source = asset.source.replace(/\$\{(.+?)\}/g,
        (_, p1) => koalaesce.getNamed(process, p1))
      let entries = fg.sync(source)
      for (let entry of entries) {
        let outputPath = path.join(output,
          asset.dest ? path.join(asset.dest, path.basename(entry)) : entry)
        console.log(outputPath)
        mkpdir(outputPath)
        fs.copyFileSync(entry, outputPath)
      }
    }
  }

  //
  // Ensure we've got the needed build applications.
  //
  let nodeBinaryPath = await download(nodeBinaryUrl)
  let nodeDir = path.basename(nodeBinaryPath, tarExt)
  let nodeExe = null
  await decompress(nodeBinaryPath, cacheDir, {filter: file => {
    if (file.path.startsWith(nodeDir + '/bin/node')) {
      nodeExe = file.path
      return true
    }
  }})
  fs.copyFileSync(path.join(cacheDir, nodeExe),
    path.join(output, path.basename(nodeExe)))
})()
