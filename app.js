const express = require("express");
const app = express();
const mongoose = require("mongoose");
const hrmRouter = require("./routes/HRMRoutes");
const authRouter = require("./routes/auth");
const userRouter = require("./routes/users");
const jobsRouter = require("./routes/jobRoutes");
const trackRouter = require("./routes/trackRoutes");
const pdfRouter = require("./routes/pdfRoutes");
const emailRouter = require("./routes/emailRoutes");
const verifyToken = require("./middlewares/verifyToken");
const security = require("./middlewares/security");
const dotenv = require('dotenv');

dotenv.config();
// Cấu hình chạy máy cá nhân: nếu có file .env.local (đã được git bỏ qua) thì nó ghi đè .env,
// ví dụ MONGODB_URI_SERVER trỏ tới MongoDB local thay vì Atlas.
// Khi chạy test (NODE_ENV=test) bỏ qua file này để test không đụng vào DB thật.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: require("path").resolve(__dirname, ".env.local"), override: true });
}

const mongoURI = process.env.MONGODB_URI_SERVER;

var path = require("path");
var bodyParser = require("body-parser");

// Sau reverse proxy của Heroku/Render: lấy đúng IP người dùng cho giới hạn tần suất
app.set("trust proxy", 1);
app.use(security.securityHeaders());
app.use(security.corsMiddleware());

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
      console.log(`Connected to MongoDB (database: ${mongoose.connection.name})`);
    }
  }
);

// Trang banner (GET /api/hrm/) để public, còn lại yêu cầu đăng nhập
const requireAuthExceptBanner = (req, res, next) => {
  if (req.method === "GET" && (req.path === "/" || req.path === "/upload_excel")) {
    return next();
  }
  return verifyToken(req, res, next);
};

app.use("/api", security.apiLimiter);

// viewer chỉ được xem: chặn mọi thao tác ghi (trừ vài POST chỉ đọc) ở các nhóm API nghiệp vụ
const { denyViewerWrites } = security;

app.use("/api/hrm", requireAuthExceptBanner, denyViewerWrites, hrmRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/job', verifyToken, denyViewerWrites, jobsRouter);
app.use('/api/track', verifyToken, denyViewerWrites, trackRouter);
app.use('/api/pdf', verifyToken, denyViewerWrites, pdfRouter);
app.use('/api/email', verifyToken, denyViewerWrites, emailRouter);
app.use('/api/ai', verifyToken, denyViewerWrites, security.aiLimiter, require("./routes/aiRoutes"));
app.use('/api/sync', verifyToken, denyViewerWrites, require("./routes/syncRoutes"));
app.use('/api/mail-cv', verifyToken, denyViewerWrites, require("./routes/mailCvRoutes"));

// Bộ lập lịch đồng bộ Google Sheet (tắt bằng SHEET_SYNC_SCHEDULER=off; không chạy khi NODE_ENV=test)
if (process.env.NODE_ENV !== "test" && process.env.SHEET_SYNC_SCHEDULER !== "off") {
  require("./services/sheetSyncScheduler").start();
}
// Bộ lập lịch nhận CV từ email (tắt bằng MAIL_INGEST_SCHEDULER=off; không chạy khi NODE_ENV=test)
if (process.env.NODE_ENV !== "test" && process.env.MAIL_INGEST_SCHEDULER !== "off") {
  require("./services/mailIngestScheduler").start();
}

app.use('/PDFUploads', express.static(path.join(__dirname, 'PDFUploads')));

module.exports = app;
