const express = require('express');
const router = express.Router();
const queryController = require('../controllers/queryController');
const validateQueryRequest = require('../middlewares/validateRequest');

router.post('/api/query', validateQueryRequest, queryController.queryJson);

module.exports = router;
