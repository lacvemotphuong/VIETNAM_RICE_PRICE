const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function createToken(user) {
  return jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user.id,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function register({ name, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!name || !normalizedEmail || typeof password !== 'string') {
    throw Object.assign(new Error('Name, email and password are required.'), { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    throw Object.assign(new Error('Password must contain between 8 and 128 characters.'), { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  const existing = await User.exists({ email: normalizedEmail });
  if (existing) {
    throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email: normalizedEmail, passwordHash });
  return { user, token: createToken(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordHash');
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw Object.assign(new Error('Email or password is incorrect.'), { status: 401 });
  }
  return { user, token: createToken(user) };
}

module.exports = { register, login };
