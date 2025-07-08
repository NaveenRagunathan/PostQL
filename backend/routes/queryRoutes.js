const express = require('express');
const router = express.Router();
const queryController = require('../controllers/queryController');
const validateQueryRequest = require('../middlewares/validateRequest');
const protectWithKey = require('../middlewares/protectWithKey');

router.post('/api/query', protectWithKey, validateQueryRequest, queryController.queryJson);

module.exports = router;
