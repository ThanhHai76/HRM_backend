const mongoose = require("mongoose");

const pdfSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  cvDate: Date,
  filename: String,
  contentType: String,
  linkCVPDF: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PDF", pdfSchema);
