# HRM Backend

API chính của hệ thống HRM: xác thực, quản lý ứng viên/job/tracking/email, lưu file CV và các tính năng AI (phân tích CV, so khớp JD). Xem [README gốc](../README.md) để có bức tranh tổng thể.

**Công nghệ:** Node.js, Express 4, MongoDB với Mongoose 6, JWT, Joi, Multer, Nodemailer, `@anthropic-ai/sdk`.

## Cài đặt và chạy

```bash
npm install
cp .env.example .env     # rồi điền giá trị thật
npm start                # nodemon app.js, mặc định cổng 3001
```

`npm start` dùng nodemon (tiện cho phát triển). Procfile (`web: npm run start`) dùng cùng lệnh này khi deploy.

### Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `MONGODB_URI_SERVER` | Có | Chuỗi kết nối MongoDB |
| `TOKEN_SECRET` | Có | Khóa ký JWT. Đổi khóa sẽ buộc mọi người đăng nhập lại |
| `PORT` | Không | Mặc định `3001` |
| `ANTHROPIC_API_KEY` | Với AI | Thiếu thì các endpoint `/api/ai/*` cần Claude trả 503 |
| `ANTHROPIC_MODEL` | Không | Mặc định `claude-sonnet-5-5` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Với đồng bộ Sheet | Nội dung file khóa JSON của Service Account (hoặc mã base64 của nó). Thiếu thì tính năng đồng bộ báo chưa cấu hình |
| `MAIL_CRED_KEY` | Với Hộp thư CV | Khóa AES-256 (32 byte, base64 hoặc hex) mã hóa mật khẩu hộp thư. Tạo: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Thiếu thì không lưu được cấu hình hộp thư |
| `MAIL_INGEST_SCHEDULER` | Không | Đặt `off` để tắt bộ lập lịch nhận CV (vẫn quét thủ công được) |
| `MAIL_ALLOW_PRIVATE_HOSTS` | Không | `true` chỉ khi tự dựng máy chủ mail nội bộ: bỏ chặn mạng nội bộ và hạn chế cổng. Mặc định tắt (chống SSRF) |
| `SHEET_SYNC_SCHEDULER` | Không | Đặt `off` để tắt bộ lập lịch tự động (vẫn đồng bộ thủ công được) |
| `CORS_ORIGINS` | Khuyến nghị | Domain frontend được phép gọi API, ví dụ `https://app.example.com,https://other.example.com`. Để trống = cho phép mọi origin (có cảnh báo khi khởi động) |
| `SMTP_USER`, `SMTP_PASS` | Với email | Tài khoản gửi email cho `POST /email/send-email` (Gmail: dùng mật khẩu ứng dụng). Thiếu thì endpoint trả 503 |
| `SMTP_FROM` | Không | Địa chỉ người gửi, mặc định `SMTP_USER` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Không | Mặc định `smtp.gmail.com`, `587`, `false` |
| `BACKEND_URI` | Không | Chỉ dùng cho luồng upload PDF cũ |

## Cấu trúc thư mục

```
app.js                  khởi động Express, gắn router và middleware xác thực
routes/                 khai báo endpoint (auth, HRM, job, track, pdf, email, ai)
controllers/            xử lý request (HRMController, AIController, CvFileController, ...)
services/               truy cập dữ liệu + aiService (gọi Claude) + matchingService (chấm điểm theo luật)
                        + googleSheetsService / sheetSyncService / sheetSyncScheduler (đồng bộ Google Sheet)
                        + mailIngestService / mailCvService / mailIngestScheduler (nhận CV từ email)
models/                 schema Mongoose (HRM, Job, Tracking, EmailTemplate, PDF, User, Company, MatchResult, CvFile)
middlewares/            verifyToken (JWT + ngữ cảnh công ty), requireRole, security (helmet, CORS, rate limit, viewer chỉ đọc)
utils/                  secretBox (mã hóa mật khẩu), hostGuard (chặn SSRF), profile, employeeColumns (ánh xạ tiêu đề cột -> trường ứng viên), tenantContext + tenantPlugin (cô lập dữ liệu), redact (che thông tin cá nhân), readExcel (đọc .xlsx bằng exceljs)
validations/            schema Joi cho đăng ký
scripts/                migrate-multitenant.js
views/                  trang banner đơn giản (EJS)
```

## Xác thực và phân quyền

- `POST /api/auth/login` trả `token` (JWT, hạn 24 giờ) chứa `_id`, `companyId`, `role`.
- Gửi token ở một trong các header: `X-AUTH-TOKEN: <token>` (frontend đang dùng), `Authorization: Bearer <token>` hoặc `auth-token`.
- Mọi route dưới `/api/*` đều yêu cầu token, **trừ** `/api/auth/*` và trang banner `GET /api/hrm/`.
- Token cũ không có `companyId` bị từ chối 401 (đăng nhập lại).
- Vai trò: `admin` (toàn quyền, xem báo cáo công bằng), `hr` (thao tác dữ liệu và duyệt AI), `viewer` (chỉ xem). `viewer` bị chặn (403) ở mọi thao tác ghi, trừ `POST /hrm/report-current-year` (chỉ đọc).
- Đăng nhập chỉ nhận `email`/`password` dạng chuỗi (chặn NoSQL injection).

### Giới hạn tần suất (`middlewares/security.js`)

| Phạm vi | Giới hạn |
|---|---|
| `POST /auth/login` | 10 lần **thất bại** / 15 phút / IP |
| `POST /auth/register` | 5 lần / giờ / IP |
| Toàn bộ `/api` | 1000 yêu cầu / 15 phút / IP |
| `/api/ai/*` | 60 lượt / 10 phút / người dùng |
| `/api/sync/sheets/*` và `/api/mail-cv` (cấu hình, kiểm tra, quét) | 20 lần / 10 phút / người dùng |

Vượt giới hạn trả `429` kèm thông báo dạng chuỗi. Backend đặt `trust proxy` = 1 để lấy đúng IP sau proxy của Heroku/Render. Bộ đếm nằm trong bộ nhớ tiến trình.

## Đa công ty (multi-tenant)

Mỗi bản ghi nghiệp vụ có `companyId`. Việc cô lập được thực hiện tự động bằng một Mongoose plugin (`utils/tenantPlugin.js`) kết hợp `AsyncLocalStorage`:

- mọi truy vấn (find, update, delete…) bị ràng buộc theo công ty của người đang đăng nhập;
- khi tạo mới, `companyId` luôn lấy từ token (bỏ qua giá trị client gửi);
- không thể đổi `companyId` qua update;
- thiếu ngữ cảnh công ty thì truy vấn bị từ chối (không trả dữ liệu).

Sau khi `multer` đọc file upload, ngữ cảnh có thể bị mất, nên các route upload gọi `verifyToken.bindTenant` ngay sau multer.

Thêm model mới cần cô lập theo công ty: gắn `schema.plugin(require("../utils/tenantPlugin"))`.

### Migration cho dữ liệu cũ

Dữ liệu tạo trước khi có đa công ty chưa có `companyId` nên sẽ không hiển thị. Chạy một lần (nhớ sao lưu DB):

```bash
node scripts/migrate-multitenant.js "Tên công ty"
```

Script gán toàn bộ dữ liệu và user cũ vào công ty đó (user đầu tiên là `admin`, các user còn lại là `hr`) và an toàn khi chạy lại.

## API

Tất cả đường dẫn bắt đầu bằng `/api`. Phản hồi thành công thường có dạng `{ data, status: "success" }`.

### Auth và người dùng
| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/auth/register` | Tạo công ty mới và tài khoản admin (`name`, `email`, `password`, tùy chọn `companyName`) |
| POST | `/auth/login` | Đăng nhập, trả `{ name, role, token }` |
| GET | `/users` | Danh sách user cùng công ty (không có mật khẩu) |

### Ứng viên (`/hrm`)
| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/hrm/all-employees` | Danh sách rút gọn (có `hasCvProfile`, `hasCvFile`) |
| GET | `/hrm/employees-cv-home` | Dữ liệu cho Dashboard |
| POST | `/hrm/report-current-year` | Ứng viên theo năm (`{ year }`) |
| POST | `/hrm/employee/create` | Tạo ứng viên |
| GET / DELETE | `/hrm/employee/:id` | Xem / xóa (xóa kèm file CV gắn với ứng viên) |
| PUT | `/hrm/employee/update/:id` | Cập nhật |
| POST | `/hrm/upload_excel` | Nhập ứng viên từ file `.xlsx` (trường `excelFile`) |

Nhập Excel: tiêu đề cột phải đúng tên tiếng Việt trong `keyMap` của `HRMController.js` (ví dụ "Họ và tên", "SĐT"); chỉ đọc sheet đầu tiên. Cột tiêu đề trùng tên được đánh hậu tố `_1`, `_2`…; ô ngày được lưu dạng `DD/MM/YYYY`.

### Job, Tracking, Email
| Nhóm | Các endpoint (CRUD) |
|---|---|
| Job | `GET /job/all-jobs`, `POST /job/create-job`, `GET /job/get-job/:id`, `PUT /job/update-job/:id`, `DELETE /job/delete-job/:id` |
| Tracking | `GET /track/all-tracks`, `POST /track/create-track`, `GET /track/get-track/:id`, `PUT /track/update-track/:id`, `DELETE /track/delete-track/:id` |
| Email mẫu | `GET /email/all-emails`, `POST /email/create-email`, `POST /email/send-email`, `GET /email/get-email/:id`, `PUT /email/update-email/:id`, `DELETE /email/delete-email/:id` |

### Đồng bộ Google Sheet (`/sync`)
| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/sync/sheets` | mọi vai trò | Cấu hình, trạng thái và lịch sử 20 lần gần nhất; email Service Account để chia sẻ Sheet |
| PUT | `/sync/sheets` | admin | `{ spreadsheet (link hoặc ID), sheetName, enabled, intervalMinutes }` |
| POST | `/sync/sheets/verify` | admin | Xác minh quyền sở hữu Sheet |
| POST | `/sync/sheets/preview` | admin, hr | Xem trước kết quả, **không ghi dữ liệu** |
| POST | `/sync/sheets/run` | admin, hr | Đồng bộ ngay |
| DELETE | `/sync/sheets` | admin | Ngắt kết nối (giữ nguyên ứng viên đã đồng bộ) |

**Mô hình:** một chiều, Sheet là nguồn chính; hệ thống chỉ đọc (scope `spreadsheets.readonly`). Kết nối bằng Service Account dùng chung cho hệ thống; mỗi công ty chia sẻ Sheet của mình cho email của Service Account với quyền Người xem.

**Xác minh quyền sở hữu:** vì Service Account dùng chung, công ty phải chứng minh sở hữu Sheet bằng cách tạo tab `HRM_SYNC` với ô A1 là mã xác minh do hệ thống cấp; thêm vào đó một Sheet chỉ được liên kết với một công ty. Nhờ vậy công ty khác không thể đọc Sheet của người khác chỉ vì biết ID. Đổi sang Sheet khác thì phải xác minh lại.

**Quy tắc đồng bộ** (`services/sheetSyncService.js`):
- Dòng đầu của tab là tiêu đề; tên cột nhận diện theo `utils/employeeColumns.js` (không phân biệt hoa/thường và dấu; có vài tên gọi phổ biến như "Số điện thoại"). Cột không nhận diện được sẽ bị bỏ qua.
- Ứng viên được nhận diện theo **SĐT đã chuẩn hóa** (`0901 234 567`, `+84901234567` coi là một), nếu không có SĐT thì theo **email**. Dòng không có cả hai bị bỏ qua. Dòng trùng khóa trong Sheet: dòng sau thắng.
- Dòng mới thì thêm; dòng có sẵn thì chỉ cập nhật các trường khác giá trị. **Ô trống trên Sheet không xóa dữ liệu**, và dòng bị xóa khỏi Sheet **không** xóa ứng viên.
- **Xung đột:** hệ thống lưu `sheetSnapshot` (giá trị lần đồng bộ trước). Nếu một trường đã bị sửa tay trên web khác với snapshot mà Sheet lại có giá trị khác, lần đồng bộ ghi đè (Sheet là nguồn chính) và đếm vào `conflicts` để báo cho người dùng.
- Mỗi ô tối đa 5000 ký tự; tối đa 20.000 dòng; thêm mới theo lô, lỗi một dòng không làm hỏng cả lô.
- **Tự động:** bộ lập lịch kiểm tra mỗi phút, chạy cho công ty đã bật và đến hạn (5 phút đến 24 giờ). Có khóa nguyên tử (`runningSince`) để nhiều instance không chạy trùng; khóa quá 10 phút được coi là treo.

**Lưu ý kỹ thuật:** `bulkWrite` không đi qua hook của plugin cô lập công ty, nên mã đồng bộ lọc `companyId` tường minh. Truy vấn xuyên công ty của bộ lập lịch dùng option `skipTenant` (chỉ dành cho mã nền của server).

### Nhận CV từ email (`/mail-cv`)
| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| GET | `/mail-cv/config` | mọi vai trò | Cấu hình (không có mật khẩu), trạng thái, số CV chờ duyệt, lịch sử 20 lần quét |
| PUT | `/mail-cv/config` | admin | Lưu cấu hình; **kiểm tra kết nối thật trước khi lưu** |
| POST | `/mail-cv/config/test` | admin | Thử lại kết nối với cấu hình đã lưu |
| DELETE | `/mail-cv/config` | admin | Ngắt kết nối và xóa mật khẩu (giữ hàng chờ và ứng viên) |
| POST | `/mail-cv/run` | admin, hr | Quét hộp thư ngay |
| GET | `/mail-cv/items?status=pending\|approved\|rejected` | mọi vai trò | Danh sách CV theo trạng thái |
| POST | `/mail-cv/items/:id/approve` | admin, hr | Duyệt `{ job, prefill }`: tạo hoặc bổ sung ứng viên, ghi Sheet |
| POST | `/mail-cv/items/:id/reject` | admin, hr | Bỏ qua: xóa file CV và dữ liệu cá nhân |
| POST | `/mail-cv/items/:id/retry-sheet` | admin, hr | Thử ghi lại dòng vào Google Sheet |

**Luồng:** quét hộp thư (IMAP) → chỉ lấy email theo bộ lọc có PDF đính kèm → AI trích xuất → **hàng chờ duyệt** → nhân sự duyệt → ứng viên (nguồn "Email") + file CV + hồ sơ AI → thêm một dòng vào Google Sheet đã liên kết. Không có bước nào AI tự quyết định tuyển hay loại ứng viên.

**Quy tắc quét** (`services/mailIngestService.js`):
- **Chỉ đọc:** mở hộp thư ở chế độ `readOnly`; không xóa, không đánh dấu đã đọc, không gửi thư. Tiến độ lưu theo UID (kèm `UIDVALIDITY`), nên không xử lý lại email cũ; lần quét đầu chỉ lấy email trong N ngày gần nhất.
- Chỉ nhận **PDF thật** (kiểm tra cả phần đầu file `%PDF-`, không tin tên hay đuôi), tối đa 10 MB/file, 3 PDF/email, 25 MB/email, 100 email/lần.
- Bộ lọc từ khóa theo tiêu đề hoặc tên file, không phân biệt hoa/thường và dấu.
- **Chống trùng:** theo mã băm file (cùng một CV gửi nhiều lần chỉ vào hàng chờ một lần) và theo SĐT/email với ứng viên có sẵn (đánh dấu "đã có trong hệ thống"). PDF không phải CV (AI không tìm thấy thông tin ứng viên) bị bỏ qua. PDF scan vào hàng chờ kèm cảnh báo để xử lý tay.
- Giới hạn 15 lần gọi AI mỗi lần quét để chặn chi phí; phần còn lại xử lý ở lần sau. Nếu AI lỗi, lần quét dừng và **không** bỏ qua email đó.
- Nội dung email không được gửi cho AI; chỉ văn bản của file CV được gửi, bọc như dữ liệu (chống chèn lệnh).
- File CV đang chờ duyệt quá 30 ngày tự xóa (TTL).

**Tự động nhập (`autoApprove`, mặc định tắt, chỉ admin bật):** sau khi AI trích xuất, CV "sạch" (PDF có chữ, có họ tên, không cờ `scanned`/`missing_contact`/`duplicate`/`email_from_sender`) được duyệt luôn bằng đúng logic bên dưới và đánh dấu `autoApproved`. CV scan, thiếu liên hệ hoặc trùng ứng viên cũ vẫn ở hàng chờ. Thống kê mỗi lần quét có `autoApproved`.

**Khi duyệt:** ứng viên mới được tạo (nguồn "Email", ngày nhập là hôm nay). Nếu đã có ứng viên cùng SĐT/email thì chỉ **điền các ô còn trống**, không ghi đè dữ liệu nhân sự đã nhập. Sau đó hệ thống thêm một dòng vào Google Sheet đã liên kết (chỉ khi bật và Sheet chưa có dòng đó); dòng được ghi với `valueInputOption=RAW` nên giá trị bắt đầu bằng `=` không bao giờ thành công thức. Lỗi ghi Sheet (ví dụ thiếu quyền Editor) **không** hủy việc tạo ứng viên và có nút thử lại. Đồng bộ Sheet sau đó thấy dòng này trùng SĐT nên không tạo trùng.

**Bảo mật:**
- Mật khẩu hộp thư mã hóa AES-256-GCM (`MAIL_CRED_KEY`), không bao giờ trả về client, bị xóa khi ngắt kết nối.
- Địa chỉ IMAP do người dùng nhập nên có chống SSRF (`utils/hostGuard.js`): chỉ cổng 993/143, phân giải DNS rồi từ chối mọi địa chỉ riêng, loopback, link-local và metadata đám mây, và kết nối thẳng vào IP đã kiểm tra.
- Quyền ghi Google Sheet dùng scope riêng, chỉ để thêm dòng vào Sheet **đã xác minh sở hữu** của chính công ty (không nhận ID Sheet từ người dùng ở bước này).

### PDF cũ
- `GET/POST/PUT/DELETE /pdf/*`: bản ghi PDF của chức năng Upload PDF cũ (frontend chỉ còn đọc `GET /pdf/all-pdfs`).

### AI Recruitment (`/ai`)
| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/ai/parse-cv` | admin, hr | Tải CV PDF (`pdfFile`, tối đa 10 MB). Trả `profile`, `prefill`, `fileId`. Tùy chọn `employeeId` để lưu luôn |
| PUT | `/ai/employees/:id/cv-profile` | admin, hr | Lưu hồ sơ đã chỉnh sửa, gắn file qua `fileId` |
| POST | `/ai/jobs/:id/extract-requirements` | admin, hr | AI đề xuất yêu cầu từ JD (không tự lưu) |
| POST | `/ai/match` | admin, hr | `{ employeeId, jobId }` — chấm điểm gợi ý |
| GET | `/ai/jobs/:jobId/rankings` | mọi vai trò | Bảng xếp hạng + bằng chứng + lịch sử duyệt |
| POST | `/ai/matches/:id/review` | admin, hr | `{ decision: shortlist\|hold\|reject, note }` (bắt buộc ghi lý do) |
| GET | `/ai/jobs/:jobId/fairness-report` | admin | Điểm theo nhóm tuổi (chỉ để kiểm toán) |
| GET | `/ai/cv-files` | mọi vai trò | Danh sách file CV đã lưu |
| GET | `/ai/cv-files/:id/download` | mọi vai trò | Tải/xem file (cần token) |
| DELETE | `/ai/cv-files/:id` | admin, hr | Xóa file |

**Cách chấm điểm** (`services/matchingService.js`, `services/aiService.js`): điểm gợi ý = trung bình của điểm theo luật (kỹ năng bắt buộc 60%, ưu tiên 15%, số năm kinh nghiệm 25%, tính bằng code) và điểm ngữ nghĩa do Claude chấm kèm bằng chứng. Claude được ép trả JSON theo schema qua tool use; điểm được giới hạn 0–100.

**File CV** lưu trong MongoDB (collection `cvfiles`) vì đĩa của Heroku/Render không bền vững. File chưa gắn ứng viên tự xóa sau 24 giờ (TTL).

## Mô hình dữ liệu chính

| Model | Ghi chú |
|---|---|
| `Company` | Công ty; `plan` dự trữ cho gói thuê bao |
| `User` | `companyId`, `role` |
| `HRM` | Ứng viên; `cvProfile` (hồ sơ năng lực do AI trích xuất, không chứa thông tin định danh), `cvFileId` |
| `Jobs` | Vị trí tuyển; `requirements`, `block`, `team` |
| `Tracking` | Theo dõi phỏng vấn, offer, thử việc |
| `EmailTemplate`, `PDF` | Email mẫu; bản ghi PDF cũ |
| `MatchResult` | Kết quả so khớp, `reviews[]` (quyết định của người), `audit` |
| `CvFile` | File CV gốc (`select: false` cho trường dữ liệu) |
| `MailboxConfig` | Cấu hình hộp thư nhận CV (mật khẩu mã hóa, UID đã xử lý, lịch sử) |
| `MailCv` | CV nhận từ email đang chờ duyệt / đã duyệt / đã bỏ qua |
| `SheetSync` | Cấu hình đồng bộ Google Sheet của công ty (Sheet, tab, chu kỳ, mã xác minh, lịch sử) |

## Kiểm thử

`npm test` chạy `mocha`, nhưng `test/test.js` là mẫu cũ (model Blog không tồn tại) nên **chưa dùng được**. Khi thêm test, nên kiểm tra tối thiểu: cô lập dữ liệu giữa hai công ty, tải file CV chéo công ty (phải 404), và AI không tự đổi trạng thái ứng viên.

## Lưu ý bảo mật

- File `.env` đang được git theo dõi (kèm lịch sử commit); cần đổi mật khẩu DB và `TOKEN_SECRET`, rồi chạy `git rm --cached .env`.
- Thông tin SMTP đã chuyển sang biến môi trường, nhưng mật khẩu cũ vẫn còn trong lịch sử git và cần được thu hồi.
- Đặt `CORS_ORIGINS` khi triển khai thật.
- Thư mục `PDFUploads/` vẫn được phục vụ công khai (`/PDFUploads`) cho luồng PDF cũ; upload PDF/Excel cũ lưu theo tên file gốc vào thư mục dùng chung.
- Lỗi 500 của một số controller còn trả `err.message` cho client.
- `npm audit --omit=dev` hiện chỉ còn cảnh báo mức vừa liên quan `uuid` (qua `exceljs`), không bị khai thác qua cách dự án dùng.
