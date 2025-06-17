const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const scrapeEverywatch = require('./scrapeEverywatch');

const app = express();
const port = 3001;

// —————————————————————————————————————————————————————————————————
// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.use(bodyParser.json({ limit: '10mb' })); // Supports large result sets
app.use(express.static(path.join(__dirname, 'public')));

let captchaSolved = false;

// —————————————————————————————————————————————————————————————————
// Delete Listing Route
app.post('/delete-listing', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const data = JSON.parse(fs.readFileSync('results.json', 'utf-8'));
    const updated = data.filter(item =>
      item.URL && decodeURIComponent(item.URL.trim()) !== decodeURIComponent(url.trim())
    );

    if (updated.length === data.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    fs.writeFileSync('results.json', JSON.stringify(updated, null, 2));
    res.json({ message: 'Listing deleted', remaining: updated.length });
  } catch (err) {
    console.error('Error deleting listing:', err);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// —————————————————————————————————————————————————————————————————
// Import Results Route
app.post('/import-results', (req, res) => {
  try {
    const json = req.body;
    if (!Array.isArray(json)) return res.status(400).json({ error: 'Invalid format' });
    fs.writeFileSync('results.json', JSON.stringify(json, null, 2));
    res.json({ message: 'Import successful', count: json.length });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import' });
  }
});

// —————————————————————————————————————————————————————————————————
// Scrape Route
app.post('/scrape', async (req, res) => {
  const { searchQuery, lookbackDays } = req.body;
  if (!searchQuery || !lookbackDays) {
    return res.status(400).json({ error: 'searchQuery and lookbackDays are required' });
  }

  captchaSolved = false;

  try {
    await scrapeEverywatch(
      searchQuery,
      parseInt(lookbackDays, 10),
      () => captchaSolved
    );
    const data = JSON.parse(fs.readFileSync('results.json'));
    res.json({ count: data.length, results: data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Scraping failed' });
  }
});

// —————————————————————————————————————————————————————————————————
// CAPTCHA Signal Route
app.post('/captcha-done', (req, res) => {
  captchaSolved = true;
  res.json({ message: 'Captcha marked as solved' });
});

// —————————————————————————————————————————————————————————————————
// Live Scrape Stream (SSE)
app.get('/scrape-stream', async (req, res) => {
  const { searchQuery, lookbackDays } = req.query;
  if (!searchQuery || !lookbackDays) {
    return res.status(400).send('Missing searchQuery or lookbackDays');
  }

  captchaSolved = false;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.write('\n');

  function sendStep(idx) {
    res.write(`event: step\n`);
    res.write(`data: ${idx}\n\n`);
  }

  try {
    await scrapeEverywatch(
      searchQuery,
      parseInt(lookbackDays, 10),
      () => captchaSolved,
      sendStep
    );

    const data = JSON.parse(fs.readFileSync('results.json'));
    res.write(`event: result\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.error(err);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify(err.message)}\n\n`);
  } finally {
    res.end();
  }
});

// —————————————————————————————————————————————————————————————————
app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
