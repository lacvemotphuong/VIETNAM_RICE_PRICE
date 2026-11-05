const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/priceController');

const router = express.Router();
router.get('/', asyncHandler(controller.listPrices));

module.exports = router;
