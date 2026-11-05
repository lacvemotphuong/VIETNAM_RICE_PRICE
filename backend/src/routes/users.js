const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.get('/me', asyncHandler(controller.getProfile));
router.patch('/me', asyncHandler(controller.updateProfile));

module.exports = router;