const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(auth);
router.get("/", controller.getDashboardData);

module.exports = router;
