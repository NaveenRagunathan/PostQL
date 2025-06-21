require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- Routes ---

app.get('/', (req, res) => {
  res.send('PostQL Backend is running and configured for Mistral AI!');
});

app.post('/api/query', async (req, res) => {
  const { json, query } = req.body;
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Mistral API key not found. Please check your .env file.' });
  }

  if (!json || !query) {
    return res.status(400).json({ error: 'Missing json or query in request body' });
  }

  const prompt = `You are a JSON assistant. Answer this query using the given JSON data.\n\nQuery: ${query}\n\nJSON: ${JSON.stringify(json)}`;

  try {
    const mistralRes = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small-2503', // Using a model compatible with the free tier
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    res.json({ result: mistralRes.data.choices[0].message.content });
  } catch (error) {
    console.error('Error calling Mistral API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to communicate with the Mistral API.' });
  }
});

// --- Start Server ---
app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    return;
  }
  console.log(`Server is running and listening on http://localhost:${PORT}`);
});
