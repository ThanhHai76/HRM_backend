const express = require("express");
const app = express();
const mongoose = require("mongoose");
const hrmRouter = require("./routes/HRMRoutes");
const authRouter = require("./routes/auth");
const userRouter = require("./routes/users");
const jobsRouter = require("./routes/jobRoutes");
const trackRouter = require("./routes/trackRoutes");
const pdfRouter = require("./routes/pdfRoutes");
const dotenv = require('dotenv');

dotenv.config();

// const mongoURI = "mongodb://localhost:27017/HRM";

const mongoURI = "mongodb+srv://thanhhai7698:haulinh1003@clustersealinh.gh276qj.mongodb.net/?retryWrites=true&w=majority";
const cors = require("cors");

var path = require("path");
var bodyParser = require("body-parser");

app.use(cors());

//fetch data from the request
app.use(bodyParser.urlencoded({ extended: false }));

//static folder
app.use(express.static(path.resolve(__dirname, "public")));

app.set("view engine", "ejs");

//middleware
app.use(express.json());

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

mongoose.set("strictQuery", false);
//configure mongoose
mongoose.connect(
  mongoURI,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
  (err) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Connected to MongoDB");
    }
  }
);

app.use("/api/hrm", hrmRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/job', jobsRouter);
app.use('/api/track', trackRouter);
app.use('/api/pdf', pdfRouter); 

app.use('/PDFUploads', express.static(path.join(__dirname, 'PDFUploads')));

module.exports = app;
