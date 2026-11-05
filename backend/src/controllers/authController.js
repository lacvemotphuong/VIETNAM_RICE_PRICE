const authService = require('../services/authService');

async function register(req, res) {
  const result = await authService.register(req.body || {});
  res.status(201).json({ token: result.token, user: result.user });
}

async function login(req, res) {
  const result = await authService.login(req.body || {});
  res.json({ token: result.token, user: result.user });
}

module.exports = { register, login };