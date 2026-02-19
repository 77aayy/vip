const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const swPath = path.join(__dirname, '..', 'public', 'sw.js')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = (pkg.version || '0.0.1').replace(/\s/g, '')
const cacheName = `loyalty-wheel-v${version}`

let sw = fs.readFileSync(swPath, 'utf-8')
sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${cacheName}';`)
fs.writeFileSync(swPath, sw)
