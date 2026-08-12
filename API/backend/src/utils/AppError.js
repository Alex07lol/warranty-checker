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
  // Non-default params first (S1788): explicit `type`, then defaulted
  // `errors`. Callers that pass only a message/statusCode are unaffected;
  // the single 3-arg caller (validate middleware) passes `type` positionally
  // and lets `errors` default.
  constructor(message, statusCode = 500, type, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    this.type = type || STATUS_TYPE[statusCode] || "operational";
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
