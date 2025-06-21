const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello from minimal server!');
});

app.listen(3002, () => {
  console.log('Minimal server running on port 3002');
});