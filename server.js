const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cors = require('cors')
const fs = require('fs')
const scrapeEverywatch = require('./scrapeEverywatch')

const app = express()
const port = 3001

// allow your Vite frontend to connect (adjust origin as needed)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}))

app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'public')))

let captchaSolved = false

// —————————————————————————————————————————————————————————————————
// Legacy JSON POST route (unchanged)
app.post('/scrape', async (req, res) => {
  const { searchQuery, lookbackDays } = req.body
  if (!searchQuery || !lookbackDays) {
    return res.status(400).json({ error: 'searchQuery and lookbackDays are required' })
  }

  captchaSolved = false

  try {
    await scrapeEverywatch(
      searchQuery,
      parseInt(lookbackDays, 10),
      () => captchaSolved
    )
    const data = JSON.parse(fs.readFileSync('results.json'))
    res.json({ count: data.length, results: data })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Scraping failed' })
  }
})
// —————————————————————————————————————————————————————————————————
// Mark CAPTCHA solved
app.post('/captcha-done', (req, res) => {
  captchaSolved = true
  res.json({ message: 'Captcha marked as solved' })
})
// —————————————————————————————————————————————————————————————————
// New SSE endpoint for live progress
// Clients should connect like:
//   const es = new EventSource(
//     `http://localhost:3001/scrape-stream?
//        searchQuery=${encodeURIComponent(q)}&
//        lookbackDays=${d}`
//   );
//   es.addEventListener('step',  e => {/* e.data == stepIndex */});
//   es.addEventListener('result', e => {/* final results array */});
//   es.addEventListener('error', e => {/* error.message */});
app.get('/scrape-stream', async (req, res) => {
  const { searchQuery, lookbackDays } = req.query
  if (!searchQuery || !lookbackDays) {
    return res.status(400).send('Missing searchQuery or lookbackDays')
  }

  captchaSolved = false

  // --- setup SSE headers ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  // initial ping
  res.write('\n')

  // helper to emit a “step” event
  function sendStep(idx) {
    res.write(`event: step\n`)
    res.write(`data: ${idx}\n\n`)
  }

  try {
    // now invoke your scraper, passing sendStep as the 4th arg
    await scrapeEverywatch(
      searchQuery,
      parseInt(lookbackDays, 10),
      () => captchaSolved,
      sendStep
    )

    // all done – read and push final results
    const data = JSON.parse(fs.readFileSync('results.json'))
    res.write(`event: result\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  } catch (err) {
    console.error(err)
    res.write(`event: error\n`)
    res.write(`data: ${JSON.stringify(err.message)}\n\n`)
  } finally {
    // close SSE
    res.end()
  }
})
// —————————————————————————————————————————————————————————————————
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
