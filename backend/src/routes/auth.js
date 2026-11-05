const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/authController');

const router = express.Router();
router.post('/register', asyncHandler(controller.register));
router.post('/login', asyncHandler(controller.login));

module.exports = router;