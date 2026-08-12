"use strict";

// Map status codes to an error classification the client can rely on
// (see errorHandler for the full taxonomy). AppErrors without an explicit
// type fall back to the status-code mapping, then "operational".
const STATUS_TYPE = {
  400: "bad_request",
  401: "authentication",
  403: "authorization",
  404: "not_found",
  409: "conflict",
  422: "validation",
  429: "rate_limited",
  502: "external",
  503: "external"
};

class AppError extends Error {
  constructor(message, statusCode = 500, errors = [], type) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    this.type = type || STATUS_TYPE[statusCode] || "operational";
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
