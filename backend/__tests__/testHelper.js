const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const queryRoutes = require('../routes/queryRoutes');

const createTestApp = () => {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(bodyParser.json());
  
  // Routes
  app.use('/', queryRoutes);
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });
  
  return app;
};

module.exports = { createTestApp };
