const service = require("../services/dashboard.service");
const { sendSuccess } = require("../utils/response");

async function getDashboardData(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.getDashboardData(req.user.userId),
      "Dashboard data retrieved"
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboardData
};
