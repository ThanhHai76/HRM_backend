const express = require("express");
const requireRole = require("../middlewares/requireRole");
const { syncLimiter } = require("../middlewares/security");
const ctrl = require("../controllers/MailCvController");

const router = express.Router();

const admin = requireRole("admin");
const hrOrAdmin = requireRole("admin", "hr");

router.get("/config", ctrl.getConfig);
router.put("/config", admin, syncLimiter, ctrl.saveConfig);
router.post("/config/test", admin, syncLimiter, ctrl.test);
router.delete("/config", admin, ctrl.disconnect);
router.post("/run", hrOrAdmin, syncLimiter, ctrl.run);

router.get("/items", ctrl.list);
router.post("/items/:id/approve", hrOrAdmin, ctrl.approve);
router.post("/items/:id/reject", hrOrAdmin, ctrl.reject);
router.post("/items/:id/retry-sheet", hrOrAdmin, ctrl.retrySheet);

module.exports = router;
