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

exports.getHRMByPhone = async (phone) => {
  return await HRMModel.find({ phoneNumber: phone });
};

exports.updateHRM = async (id, HRM) => {
  return await HRMModel.findByIdAndUpdate(id, HRM);
};

exports.deleteHRM = async (id) => {
  return await HRMModel.findByIdAndDelete(id);
};

exports.insertMany = async (jsonObj) => {
  HRMModel.insertMany(jsonObj, (err, data) => {
    if (err) {
      console.log(err);
    }
  });
};
