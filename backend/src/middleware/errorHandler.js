'use strict';

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ detail: 'Internal server error.', error_code: 'internal_error' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ detail: 'Not found' });
}

module.exports = { errorHandler, notFoundHandler };
