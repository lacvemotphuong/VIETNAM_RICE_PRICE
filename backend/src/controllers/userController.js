const User = require('../models/User');

async function getProfile(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw Object.assign(new Error('User account was not found.'), { status: 404 });
  res.json({ user });
}

async function updateProfile(req, res) {
  const updates = {};
  if (req.body?.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.trim().length > 80) {
      throw Object.assign(new Error('Name must contain between 2 and 80 characters.'), { status: 400 });
    }
    updates.name = req.body.name.trim();
  }
  if (req.body?.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
    }
    updates.email = email;
  }
  if (!Object.keys(updates).length) {
    throw Object.assign(new Error('Provide a name or email to update.'), { status: 400 });
  }
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
  if (!user) throw Object.assign(new Error('User account was not found.'), { status: 404 });
  res.json({ user });
}

module.exports = { getProfile, updateProfile };
