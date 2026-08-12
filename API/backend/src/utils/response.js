"use strict";

function sendSuccess(res, data, message, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

// meta.error ({ type, requestId }) is appended only when provided, so the
// base { success, message, errors } contract is unchanged.
function sendError(res, message, statusCode = 500, errors = [], meta = {}) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(meta.error ? { error: meta.error } : {})
  });
}

module.exports = {
  sendSuccess,
  sendError
};
