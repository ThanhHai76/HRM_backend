const express = require("express");
const {
  getAllPDFs,
  createPDF,
  getPDFById,
  updatePDF,
  deletePDF,
  uploadPDFController,
  uploadErrorController
} = require("../controllers/uploadPDFController");
const verifyToken = require("../middlewares/verifyToken");
const router = express.Router();

var multer = require("multer");
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./PDFUploads");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
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

router
  .route("/upload_pdf")
  .post(uploadsPDF.single("pdfFile"), verifyToken.bindTenant, uploadPDFController);

router.route("/all-pdfs").get(getAllPDFs);
router.route("/create-pdf").post(createPDF);
router.route("/get-pdf/:id").get(getPDFById);
router.route("/update-pdf/:id").put(updatePDF);
router.route("/delete-pdf/:id").delete(deletePDF);

// Bắt lỗi multer (sai định dạng, quá dung lượng) -> 400 JSON
router.use(uploadErrorController);

module.exports = router;
