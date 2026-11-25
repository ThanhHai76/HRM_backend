const HRMModel = require("../models/HRM");

exports.getAllHRM = async () => {
  return await HRMModel.find();
};

exports.createHRM = async (HRM) => {
  return await HRMModel.create(HRM);
};
exports.getHRMById = async (id) => {
  return await HRMModel.findById(id);
};

exports.updateHRM = async (id, HRM) => {
  return await HRMModel.findByIdAndUpdate(id, HRM);
};

exports.deleteHRM = async (id) => {
  const deleted = await HRMModel.findByIdAndDelete(id);
  // Xóa luôn file CV gốc gắn với ứng viên (dữ liệu cá nhân)
  if (deleted && deleted.cvFileId) {
    await require("../models/CvFile").findByIdAndDelete(deleted.cvFileId);
  }
  return deleted;
};

exports.insertMany = async (jsonObj) => {
  return await HRMModel.insertMany(jsonObj);
};
