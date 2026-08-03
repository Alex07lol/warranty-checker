const express = require("express");
const auth = require("../middleware/auth");
const validate = require("../middleware/validate");
const controller = require("../controllers/serviceHistory.controller");
const {
  createServiceHistorySchema,
  updateServiceHistorySchema
} = require("../validators/serviceHistory.validator");

const router = express.Router({ mergeParams: true });

router.use(auth);
router.get("/", controller.getServiceHistory);
router.post("/", validate(createServiceHistorySchema), controller.addServiceRecord);
router.get("/:recordId", controller.getServiceRecordById);
router.put("/:recordId", validate(updateServiceHistorySchema), controller.updateServiceRecord);
router.delete("/:recordId", controller.deleteServiceRecord);

module.exports = router;
