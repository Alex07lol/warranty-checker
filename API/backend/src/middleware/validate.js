const AppError = require("../utils/AppError");

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      return next(new AppError("Validation failed", 422, "validation", errors));
    }

    req.body = value;
    return next();
  };
}

module.exports = validate;
