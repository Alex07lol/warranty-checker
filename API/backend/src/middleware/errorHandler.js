"use strict";

const AppError = require("../utils/AppError");
const { sendError } = require("../utils/response");
const { NODE_ENV } = require("../config/env");
const logger = require("../utils/logger");

// Stable classification taxonomy: expected/operational, validation,
// authentication, authorization, external (upstream), conflict, internal.
function classify(err) {
  if (err instanceof AppError) return err.type || "operational";
  if (err.name === "ValidationError") return "validation";
  // CastError is an invalid ObjectId — surfaced as 400 bad_request to stay
  // consistent with AppError's status->type mapping (400 = bad_request).
  if (err.name === "CastError") return "bad_request";
  if (err.name === "MulterError") return "validation";
  if (err.code === 11000) return "conflict";
  return "internal";
}

function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let message = "Internal server error";
  let errors = [];

  if (err instanceof AppError || err.isOperational) {
    statusCode = err.statusCode || 500;
    message = err.message;
    errors = err.errors || [];
  } else if (err.name === "ValidationError") {
    statusCode = 422;
    message = "Validation failed";
    errors = Object.values(err.errors).map((item) => item.message);
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID";
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "Duplicate resource";
  } else if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = "File exceeds maximum size of 5MB";
  } else if (err.name === "MulterError" && err.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 422;
    message = "Unsupported file type. Use JPEG, PNG, WEBP, or PDF.";
  }

  const type = classify(err);

  // Server-side diagnostics with the request context, never the stack in
  // production, and never request bodies/headers (tokens, passwords…).
  const logFields = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    type
  };
  if (NODE_ENV !== "production") {
    logger.error(err.stack || err.message, logFields);
  } else {
    logger.error(err.message, logFields);
  }

  return sendError(res, message, statusCode, errors, {
    error: { type, requestId: req.id }
  });
}

module.exports = errorHandler;
