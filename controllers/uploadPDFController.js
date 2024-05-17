const fs = require("fs");
const PDF = require("../models/Pdf"); // Đường dẫn đến tệp pdfModel.js
const pdfService = require("../services/pdfService");
const path = require("path");

exports.getAllPDFs = async (req, res) => {
  try {
    const PDFs = await pdfService.getAllPDFs();
    res.json({ data: PDFs, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPDF = async (req, res) => {
  try {
    const PDF = await pdfService.createPDF(req.body);
    res.json({ data: PDF, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPDFById = async (req, res) => {
  try {
    const PDF = await pdfService.getPDFById(req.params.id);
    res.json({ data: PDF, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePDF = async (req, res) => {
  try {
    const PDF = await pdfService.updatePDF(req.params.id, req.body);
    res.json({ data: PDF, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deletePDF = async (req, res) => {
  try {
    const PDF = await pdfService.deletePDF(req.params.id);
    res.json({ data: PDF, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Hàm lưu tệp PDF trên máy chủ và lưu vào MongoDB
function savePDF(request, file, savePath) {
  return new Promise((resolve, reject) => {
    // Tạo một luồng ghi (write stream) đến đích lưu trữ trên máy chủ
    const writeStream = fs.createWriteStream(savePath);

    // Ghi dữ liệu từ luồng đọc (read stream) của tệp đã tải lên vào luồng ghi
    file.stream.pipe(writeStream);

    // Xử lý sự kiện khi hoàn tất việc ghi
    writeStream.on("finish", async () => {
      try {
        pdfService.createPDF({
          name: request.body.name,
          phone: request.body.phone,
          email: request.body.email,
          cvDate: request.body.cvDate,
          filename: file.originalname,
          contentType: file.mimetype,
          linkCVPDF: savePath,
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });

    // Xử lý sự kiện lỗi nếu có vấn đề xảy ra trong quá trình ghi
    writeStream.on("error", (error) => {
      reject(error);
    });
  });
}

exports.uploadPDFController = async (req, res) => {
  try {
    // const savePath = path.join(
    //   __dirname.replace("controllers", "/"),
    //   req.file.path
    // ); // đường dẫn và tên tệp lưu trữ trên máy chủ
    const savePath = process.env.BACKEND_URI_PDF_SERVER + "/" + req.file.path;
    res.json({ data: savePath.replaceAll("\\", "/"), status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadErrorController = (error, req, res, next) => {
  res.status(400).send({
    error: error.message,
  });
};
