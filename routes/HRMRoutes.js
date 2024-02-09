const express = require("express");
const {
  getAllHRM,
  createHRM,
  getHRMById,
  getHRMByPhone,
  updateHRM,
  deleteHRM,
  uploadControllerGet,
  uploadControllerPost,
  uploadErrorController,
  uploadPDFController,
} = require("../controllers/HRMController");

const router = express.Router();

router.route("/all-employees").get(getAllHRM);
router.route("/employee/create").post(createHRM);
router.route("/employee/:id").get(getHRMById).delete(deleteHRM);
router.route("/employee/update/:id").put(updateHRM);
router.route("/employee/findByPhone").get(getHRMByPhone);

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
      return cb(new Error("Please upload a PDF"));
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
  .post(uploads.single("excelFile"), uploadControllerPost),
  uploadErrorController;

router
  .route("/upload_pdf")
  .post(uploadsPDF.single("pdfFile"), uploadPDFController),
  uploadErrorController;

module.exports = router;
