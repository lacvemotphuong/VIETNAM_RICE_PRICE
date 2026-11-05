function notFound(req, _res, next) {
  next(Object.assign(new Error(`Route not found: ${req.method} ${req.originalUrl}`), { status: 404 }));
}

function errorHandler(error, _req, res, _next) {
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) {
    console.error(error);
  }
  const message =
    error.code === 11000
      ? 'An account with this email already exists.'
      : status >= 500
        ? 'An unexpected server error occurred.'
        : error.message || 'An unexpected server error occurred.';
  res.status(status).json({ error: { message, ...(error.code ? { code: error.code } : {}) } });
}

module.exports = { notFound, errorHandler };
