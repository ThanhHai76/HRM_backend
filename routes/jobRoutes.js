const express = require("express");
const { getAllJobs, createJob, getJobById, deleteJob, updateJob } = require("../controllers/JobController");
const router = express.Router();

router.route("/all-jobs").get(getAllJobs);
router.route("/create-job").post(createJob);
router.route("/get-job/:id").get(getJobById);
router.route("/update-job/:id").put(updateJob);
router.route("/delete-job/:id").delete(deleteJob);

module.exports = router;