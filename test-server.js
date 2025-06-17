const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

app.post('/delete-listing', (req, res) => {
  console.log('✅ POST /delete-listing hit');
  console.log('Body:', req.body);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
