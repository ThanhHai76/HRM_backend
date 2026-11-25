const express = require("express");
const multer = require("multer");
const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");
const ai = require("../controllers/AIController");
const cvFiles = require("../controllers/CvFileController");

const router = express.Router();

// Giữ CV trong bộ nhớ (không ghi file lên đĩa) để giảm rủi ro lộ dữ liệu cá nhân
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Chỉ chấp nhận file PDF"));
    }
    cb(null, true);
  },
});

const hrOnly = requireRole("admin", "hr");

router.post("/parse-cv", hrOnly, upload.single("pdfFile"), verifyToken.bindTenant, ai.parseCv);
router.get("/cv-files", cvFiles.list);
router.get("/cv-files/:id/download", cvFiles.download);
router.delete("/cv-files/:id", hrOnly, cvFiles.remove);
router.put("/employees/:id/cv-profile", hrOnly, ai.saveCvProfile);
router.post("/jobs/:id/extract-requirements", hrOnly, ai.extractJobRequirements);
router.post("/match", hrOnly, ai.match);
router.get("/jobs/:jobId/rankings", ai.rankings);
router.post("/matches/:id/review", hrOnly, ai.review);
router.get("/jobs/:jobId/fairness-report", requireRole("admin"), ai.fairnessReport);

// Lỗi multer (sai định dạng, quá dung lượng) -> 400 JSON
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

module.exports = router;
