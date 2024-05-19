const EmailModel = require("../models/Email");

exports.getAllEmails = async () => {
  return await EmailModel.find();
};

exports.createEmail = async (Email) => {
  return await EmailModel.create(Email);
};

exports.getEmailById = async (id) => {
    return await EmailModel.findById(id);
  };

exports.updateEmail = async (id, Email) => {
  return await EmailModel.findByIdAndUpdate(id, Email);
};

exports.deleteEmail = async (id) => {
  return await EmailModel.findByIdAndDelete(id);
};
