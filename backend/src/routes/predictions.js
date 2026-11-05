const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/predictionController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.get('/models', asyncHandler(controller.listModels));
router.get('/options', asyncHandler(controller.listOptions));
router.post('/', asyncHandler(controller.createPrediction));
router.get('/', asyncHandler(controller.listHistory));
router.get('/:id', asyncHandler(controller.getPrediction));

module.exports = router;