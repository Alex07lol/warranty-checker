const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/notification.controller");

const router = express.Router();

router.use(auth);
router.get("/", controller.getNotifications);
router.put("/read-all", controller.markAllAsRead);
router.put("/:id/read", controller.markAsRead);
router.delete("/:id", controller.deleteNotification);

module.exports = router;
