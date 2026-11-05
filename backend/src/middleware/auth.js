const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authenticate(req, _res, next) {
  const authorization = req.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(Object.assign(new Error('Authentication is required.'), { status: 401 }));
  }

  try {
    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    if (!payload.sub) {
      return next(Object.assign(new Error('Invalid authentication token.'), { status: 401 }));
    }
    const user = await User.findById(payload.sub).select('_id role');
    if (!user) {
      return next(Object.assign(new Error('The account for this token no longer exists.'), { status: 401 }));
    }
    req.user = { id: user.id, role: user.role };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(Object.assign(new Error('Invalid or expired authentication token.'), { status: 401 }));
    }
    return next(error);
  }
}

function authorizeRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(Object.assign(new Error('You do not have permission to perform this action.'), { status: 403 }));
    }
    return next();
  };
}

module.exports = { authenticate, authorizeRoles };