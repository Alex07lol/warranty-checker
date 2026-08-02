const AppError = require("../utils/AppError");
const { verifyToken } = require("../utils/jwtHelper");

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("Unauthorized", 401));
  }

  const token = header.slice(7).trim();

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch (error) {
    return next(new AppError("Unauthorized", 401));
  }
}

module.exports = auth;
