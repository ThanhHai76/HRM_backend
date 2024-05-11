const TrackModel = require("../models/Tracking");

exports.getAllTracks = async () => {
  return await TrackModel.find();
};

exports.createTrack = async (job) => {
  return await TrackModel.create(job);
};

exports.getTrackById = async (id) => {
  return await TrackModel.findById(id);
};

exports.updateTrack = async (id, job) => {
  return await TrackModel.findByIdAndUpdate(id, job);
};

exports.deleteTrack = async (id) => {
  return await TrackModel.findByIdAndDelete(id);
};

exports.insertMany = async (jsonObj) => {
  TrackModel.insertMany(jsonObj, (err, data) => {
    if (err) {
      console.log(err);
    }
  });
};
