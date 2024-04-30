const JobsModel = require("../models/Job");

exports.getAllJobs = async () => {
  return await JobsModel.find();
};

exports.createJob = async (job) => {
  return await JobsModel.create(job);
};

exports.getJobById = async (id) => {
    return await JobsModel.findById(id);
  };

exports.updateJob = async (id, job) => {
  return await JobsModel.findByIdAndUpdate(id, job);
};

exports.deleteJob = async (id) => {
  return await JobsModel.findByIdAndDelete(id);
};

exports.insertMany = async (jsonObj) => {
    JobsModel.insertMany(jsonObj, (err, data) => {
    if (err) {
      console.log(err);
    }
  });
};
