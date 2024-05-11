const mongoose = require("mongoose");
const Schema = mongoose.Schema;
 
const trackingSchema = new Schema({
  cvDate: String,
  job: String,
  name: String,
  phone: String,
  email: String,
  linkCV: String,
  interviewDate: Date,
  interviewTime: Date,
  interviewer: String,
  interviewRoom: String,
  team: String,
  interviewTimeChange: String,
  joinRound1Status: String,
  testInterviewRound2: String,
  joinRound2Status: String,
  evaluation: String,
  interviewResult: String,
  interviewResultClosingDate: Date,
  offerResult: String,
  officialSalary: String,
  probationarySalary: String,
  startWorkDate: Date,
  probationaryTime: String,
  probationaryEndDate: Date,
  sendMail: String,
  probationStatus: String,
  statusUpdate: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const TrackModel = mongoose.model("Tracking", trackingSchema);
 
module.exports = TrackModel;