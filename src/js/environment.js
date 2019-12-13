//
// Fix up environment vars
//
if (typeof (process.versions.electron) === 'string') {
  let env = process.env
  env['STORAGE'] = 'electron'
}
