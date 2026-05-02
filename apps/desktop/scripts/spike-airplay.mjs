import { app, desktopCapturer } from 'electron'

function argValue(name, fallback) {
  const prefix = `--${name}=`
  const raw = process.argv.find(arg => arg.startsWith(prefix))
  if (!raw) return fallback
  const value = Number(raw.slice(prefix.length))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sourceKey(source) {
  return `${source.id}\t${source.name}`
}

function interesting(source) {
  return /airplay|iphone|receiver|continuity|mirroring/i.test(`${source.name} ${source.id}`)
}

const minutes = argValue('minutes', 30)
const intervalSec = argValue('interval', 5)
const deadline = Date.now() + minutes * 60_000
let previous = new Map()

async function snapshot() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1, height: 1 },
  })
  const current = new Map(sources.map(source => [sourceKey(source), source]))
  const added = [...current.entries()].filter(([key]) => !previous.has(key)).map(([, source]) => source)
  const removed = [...previous.entries()].filter(([key]) => !current.has(key)).map(([, source]) => source)

  if (previous.size === 0) {
    console.log(`[airplay-spike] watching ${sources.length} sources for ${minutes} minutes; interval ${intervalSec}s`)
    for (const source of sources.filter(interesting)) {
      console.log(`[airplay-spike] initial suspicious source: ${source.id} | ${source.name}`)
    }
  } else {
    for (const source of added) {
      console.log(`[airplay-spike] added: ${source.id} | ${source.name}${interesting(source) ? '  <-- suspicious' : ''}`)
    }
    for (const source of removed) {
      console.log(`[airplay-spike] removed: ${source.id} | ${source.name}${interesting(source) ? '  <-- suspicious' : ''}`)
    }
  }

  previous = current
}

await app.whenReady()
await snapshot()
const timer = setInterval(() => {
  if (Date.now() >= deadline) {
    clearInterval(timer)
    app.quit()
    return
  }
  snapshot().catch(error => console.error('[airplay-spike] poll failed:', error))
}, intervalSec * 1000)
