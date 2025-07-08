const protectWithKey = (req, res, next) => {
  const userKey = req.headers['x-api-key'];
  if (!userKey || userKey !== process.env.APP_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: Invalid API key' });
  }
  next();
};

module.exports = protectWithKey;
