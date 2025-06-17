const express = require('express');
const app = express();
const port = 3001;

app.use(express.json());

app.post('/delete-listing', (req, res) => {
  console.log('✅ POST received:', req.body);
  res.json({ message: 'Delete route works' });
});

app.listen(port, () => {
  console.log(`🟢 Server running on http://localhost:${port}`);
});
