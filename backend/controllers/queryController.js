const axios = require('axios');

exports.queryJson = async (req, res) => {
  const { json, query } = req.body;
  const apiKey = req.headers['x-api-key'] || process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Mistral API key not found. Please check your .env file.' });
  }

  const prompt = `You are a JSON assistant. Answer this query using the given JSON data.\n\nQuery: ${query}\n\nJSON: ${JSON.stringify(json)}`;

  try {
    const mistralRes = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small-2503',
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return res.status(200).json({
      status: 'success',
      data: {
        result: mistralRes.data.choices[0].message.content
      }
    });

  } catch (error) {
    console.error('Mistral API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to communicate with the Mistral API.' });
  }
};
