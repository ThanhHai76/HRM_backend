const PDFModel = require("../models/Pdf");

exports.getAllPDFs = async () => {
  return await PDFModel.find();
};

exports.createPDF = async (PDF) => {
  return await PDFModel.create(PDF);
};

exports.getPDFById = async (id) => {
    return await PDFModel.findById(id);
  };

exports.updatePDF = async (id, PDF) => {
  return await PDFModel.findByIdAndUpdate(id, PDF);
};

exports.deletePDF = async (id) => {
  return await PDFModel.findByIdAndDelete(id);
};

exports.insertMany = async (jsonObj) => {
    PDFModel.insertMany(jsonObj, (err, data) => {
    if (err) {
      console.log(err);
    }
  });
};
