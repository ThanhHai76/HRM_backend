const trackService = require("../services/trackService");

exports.getAllTracks = async (req, res) => {
  try {
    const jobs = await trackService.getAllTracks();
    res.json({ data: jobs, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTrack = async (req, res) => {
  try {
    const job = await trackService.createTrack(req.body);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTrackById = async (req, res) => {
  try {
    const job = await trackService.getTrackById(req.params.id);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTrack = async (req, res) => {
  try {
    const job = await trackService.updateTrack(req.params.id, req.body);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTrack = async (req, res) => {
  try {
    const job = await trackService.deleteTrack(req.params.id);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
