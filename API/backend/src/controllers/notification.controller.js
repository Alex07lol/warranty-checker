const service = require("../services/notification.service");
const { sendSuccess } = require("../utils/response");

async function getNotifications(req, res, next) {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    return sendSuccess(
      res,
      await service.getNotifications(
        req.user.userId,
        unreadOnly,
        req.query.page,
        req.query.limit
      ),
      "Notifications retrieved"
    );
  } catch (error) {
    return next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    return sendSuccess(
      res,
      await service.markAsRead(req.params.id, req.user.userId),
      "Notification marked as read"
    );
  } catch (error) {
    return next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await service.markAllAsRead(req.user.userId);
    return sendSuccess(res, null, "All notifications marked as read");
  } catch (error) {
    return next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    await service.deleteNotification(req.params.id, req.user.userId);
    return sendSuccess(res, null, "Notification deleted");
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
