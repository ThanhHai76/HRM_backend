const jobService = require("../services/jobService");

exports.getAllJobs = async (req, res) => {
  try {
    const jobs = await jobService.getAllJobs();
    res.json({ data: jobs, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createJob = async (req, res) => {
  try {
    const job = await jobService.createJob(req.body);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getJobById = async (req, res) => {
  try {
    const job = await jobService.getJobById(req.params.id);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const job = await jobService.updateJob(req.params.id, req.body);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const job = await jobService.deleteJob(req.params.id);
    res.json({ data: job, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
