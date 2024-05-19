const express = require("express");
const { getAllEmails, createEmail, sendEmail, getEmailById, deleteEmail, updateEmail } = require("../controllers/EmailController");
const router = express.Router();

router.route("/all-emails").get(getAllEmails);
router.route("/create-email").post(createEmail);
router.route("/send-email").post(sendEmail);
router.route("/get-email/:id").get(getEmailById);
router.route("/update-email/:id").put(updateEmail);
router.route("/delete-email/:id").delete(deleteEmail);

module.exports = router;