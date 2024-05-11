const express = require("express");
const {
  getAllTracks,
  createTrack,
  getTrackById,
  updateTrack,
  deleteTrack,
} = require("../controllers/TrackController");
const router = express.Router();

router.route("/all-tracks").get(getAllTracks);
router.route("/create-track").post(createTrack);
router.route("/get-track/:id").get(getTrackById);
router.route("/update-track/:id").put(updateTrack);
router.route("/delete-track/:id").delete(deleteTrack);

module.exports = router;
