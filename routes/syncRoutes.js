const express = require("express");
const requireRole = require("../middlewares/requireRole");
const { syncLimiter } = require("../middlewares/security");
const ctrl = require("../controllers/SheetSyncController");

const router = express.Router();

const admin = requireRole("admin");
const hrOrAdmin = requireRole("admin", "hr");

router.get("/sheets", ctrl.getConfig);
router.put("/sheets", admin, ctrl.saveConfig);
router.delete("/sheets", admin, ctrl.disconnect);
router.post("/sheets/verify", admin, syncLimiter, ctrl.verify);
router.post("/sheets/preview", hrOrAdmin, syncLimiter, ctrl.preview);
router.post("/sheets/run", hrOrAdmin, syncLimiter, ctrl.run);

module.exports = router;
