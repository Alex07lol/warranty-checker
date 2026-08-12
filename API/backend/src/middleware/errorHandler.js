const AppError = require("../utils/AppError");
const { sendError } = require("../utils/response");
const { NODE_ENV } = require("../config/env");

function errorHandler(err, req, res, next) {
  if (err instanceof AppError || err.isOperational) {
    return sendError(res, err.message, err.statusCode || 500, err.errors || []);
  }

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((item) => item.message);
    return sendError(res, "Validation failed", 422, errors);
  }

  if (err.code === 11000) {
    return sendError(res, "Duplicate resource", 409, []);
  }

  if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
    return sendError(res, "File exceeds maximum size of 5MB", 400, []);
  }

  if (err.name === "MulterError" && err.code === "LIMIT_UNEXPECTED_FILE") {
    return sendError(res, "Unsupported file type. Use JPEG, PNG, WEBP, or PDF.", 422, []);
  }

  if (NODE_ENV !== "production") {
    process.stderr.write(`${err.stack || err.message}\n`);
  } else {
    process.stderr.write(`${err.message}\n`);
  }

  return sendError(res, "Internal server error", 500, []);
}

module.exports = errorHandler;
