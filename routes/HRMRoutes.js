const express = require("express");
const {
  getAllHRM,
  createHRM,
  getHRMById,
  updateHRM,
  deleteHRM,
  uploadControllerGet,
  uploadControllerPost,
  uploadErrorController,
  uploadPDFController,
  reportCurrentYear,
  getAllEmployeesCVHome,
} = require("../controllers/HRMController");

const verifyToken = require("../middlewares/verifyToken");
const router = express.Router();

router.route("/").get(uploadControllerGet);
router.route("/all-employees").get(getAllHRM);
router.route("/employees-cv-home").get(getAllEmployeesCVHome);
router.route("/report-current-year").post(reportCurrentYear);
router.route("/employee/create").post(createHRM);
router.route("/employee/:id").get(getHRMById).delete(deleteHRM);
router.route("/employee/update/:id").put(updateHRM);

var multer = require("multer");
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
var uploads = multer({
  limits: {
    fileSize: 20000000,
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.xlsx$/)) {
      return cb(new Error("Please upload an Excel (.xlsx) file"));
    }
    cb(undefined, true);
  },
  storage: storage,
});

const uploadsPDF = multer({
  limits: {
    fileSize: 20000000,
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.pdf$/)) {
      return cb(new Error("Please upload a PDF"));
    }
    cb(undefined, true);
  },
  storage: storage,
});

router.route("/upload_excel").get(uploadControllerGet);
router
  .route("/upload_excel")
  .post(uploads.single("excelFile"), verifyToken.bindTenant, uploadControllerPost);

router
  .route("/upload_pdf")
  .post(uploadsPDF.single("pdfFile"), verifyToken.bindTenant, uploadPDFController);

// Bắt lỗi multer (sai định dạng, quá dung lượng) -> 400 JSON
router.use(uploadErrorController);

module.exports = router;
