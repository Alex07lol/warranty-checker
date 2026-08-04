const service = require("../services/serviceHistory.service");
const { sendSuccess } = require("../utils/response");

async function getServiceHistory(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.getServiceHistory(req.params.productId, req.user.userId),
      "Service history retrieved"
    );
  } catch (error) {
    return next(error);
  }
}

async function addServiceRecord(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.addServiceRecord(req.params.productId, req.user.userId, req.body),
      "Service record created",
      201
    );
  } catch (error) {
    return next(error);
  }
}

async function getServiceRecordById(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.getServiceRecordById(req.params.productId, req.params.recordId, req.user.userId),
      "Service record retrieved"
    );
  } catch (error) {
    return next(error);
  }
}

async function updateServiceRecord(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.updateServiceRecord(
        req.params.productId,
        req.params.recordId,
        req.user.userId,
        req.body
      ),
      "Service record updated"
    );
  } catch (error) {
    return next(error);
  }
}

async function deleteServiceRecord(req, res, next) {
  try {
    await service.deleteServiceRecord(
      req.params.productId,
      req.params.recordId,
      req.user.userId
    );
    return sendSuccess(res, null, "Service record deleted");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getServiceHistory,
  addServiceRecord,
  getServiceRecordById,
  updateServiceRecord,
  deleteServiceRecord
};
