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

    // Post-process to remove markdown code blocks and just return plain text
    let content = mistralRes.data.choices[0].message.content;
    // Remove triple backtick code blocks (including language hints)
    content = content.replace(/```[a-zA-Z]*[\s\S]*?```/g, '').trim();
    // Remove any leftover markdown artifacts
    content = content.replace(/^[#*>\-]+\s?/gm, '').replace(/\n{2,}/g, '\n').trim();
    return res.status(200).json({
      status: 'success',
      data: {
        result: content
      }
    });

  } catch (error) {
    console.error('Mistral API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to communicate with the Mistral API.' });
  }
};
