const { GoogleAuth } = require("google-auth-library");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const MAX_ROWS = 20000;

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Thông tin Service Account lấy từ biến môi trường GOOGLE_SERVICE_ACCOUNT_JSON (JSON thô hoặc base64).
let credentials;
const loadCredentials = () => {
  if (credentials !== undefined) return credentials;
  credentials = null;
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return credentials;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text);
    if (parsed.client_email && parsed.private_key) credentials = parsed;
  } catch (e) {
    credentials = null;
  }
  return credentials;
};

exports.isConfigured = () => !!loadCredentials();
exports.getServiceAccountEmail = () => (loadCredentials() ? loadCredentials().client_email : null);

// Chấp nhận cả URL Google Sheet lẫn ID thuần
exports.parseSpreadsheetId = (input) => {
  const text = String(input || "").trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  const id = m ? m[1] : text;
  return /^[a-zA-Z0-9_-]{20,}$/.test(id) ? id : null;
};

let auth;
const getHeaders = async () => {
  const creds = loadCredentials();
  if (!creds) throw httpError(503, "Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON trên máy chủ");
  if (!auth) auth = new GoogleAuth({ credentials: creds, scopes: [SCOPE] });
  const client = await auth.getClient();
  return client.getRequestHeaders();
};

const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;

/**
 * Đọc giá trị đã hiển thị (FORMATTED_VALUE) của một vùng. Trả về mảng các dòng (mảng chuỗi).
 * Chỉ gọi tới host cố định của Google; ID Sheet và tên tab được mã hóa trong URL.
 */
exports.fetchValues = async (spreadsheetId, range) => {
  const headers = await getHeaders();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    if (res.status === 403) throw httpError(403, `Chưa chia sẻ Sheet cho ${exports.getServiceAccountEmail()} (quyền Người xem)`);
    if (res.status === 404) throw httpError(404, "Không tìm thấy Google Sheet");
    if (res.status === 400) {
      const detail = await res.json().catch(() => ({}));
      const msg = String((detail.error && detail.error.message) || "");
      if (/office file/i.test(msg)) {
        throw Object.assign(httpError(422, 'File này là Excel (.xlsx) tải lên Drive, chưa phải Google Sheet. Mở file trong Google Drive, chọn "Tệp → Lưu dưới dạng Google Trang tính", rồi dùng link của bản mới.'), { officeFile: true });
      }
      throw httpError(400, "Không tìm thấy tab hoặc vùng dữ liệu trong Sheet (kiểm tra tên tab)");
    }
    throw httpError(502, `Google Sheets trả lỗi ${res.status}`);
  }
  const body = await res.json();
  return (body.values || []).slice(0, MAX_ROWS + 1);
};

exports.readSheet = async (spreadsheetId, sheetName) => {
  try {
    return await exports.fetchValues(spreadsheetId, quoteSheet(sheetName));
  } catch (e) {
    if (e.status !== 400 || e.officeFile) throw e;
    // Sai tên tab: liệt kê các tab có sẵn để người dùng chọn đúng
    try {
      const headers = await getHeaders();
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
        { headers, signal: AbortSignal.timeout(30000) }
      );
      if (res.ok) {
        const tabs = ((await res.json()).sheets || []).map((s) => s.properties.title).filter((t) => t !== "HRM_SYNC");
        if (tabs.length) throw httpError(422, `Không tìm thấy tab "${sheetName}". Các tab có trong Sheet: ${tabs.map((t) => `"${t}"`).join(", ")}.`);
      }
    } catch (inner) {
      if (inner.status === 422) throw inner;
    }
    throw e;
  }
};

// Kiểm tra quyền sở hữu: tab HRM_SYNC, ô A1 phải bằng mã xác minh
exports.checkOwnership = async (spreadsheetId, verifyCode) => {
  let values;
  try {
    values = await exports.fetchValues(spreadsheetId, `${quoteSheet("HRM_SYNC")}!A1:A1`);
  } catch (e) {
    if (e.status === 400) throw httpError(422, `Sheet chưa có tab "HRM_SYNC". Hãy tạo tab này và dán mã xác minh vào ô A1.`);
    throw e;
  }
  const cell = values[0] && values[0][0] ? String(values[0][0]).trim() : "";
  if (!verifyCode || cell !== verifyCode) {
    throw httpError(422, `Ô A1 của tab "HRM_SYNC" chưa đúng mã xác minh.`);
  }
  return true;
};

// ---- Ghi: chỉ thêm dòng ở cuối tab. Dùng scope ghi riêng, tách khỏi scope chỉ đọc của đồng bộ.
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
let writeAuth;
const getWriteHeaders = async () => {
  const creds = loadCredentials();
  if (!creds) throw httpError(503, "Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON trên máy chủ");
  if (!writeAuth) writeAuth = new GoogleAuth({ credentials: creds, scopes: [WRITE_SCOPE] });
  const client = await writeAuth.getClient();
  return client.getRequestHeaders();
};

/**
 * Thêm MỘT dòng vào cuối tab. valueInputOption=RAW nên giá trị bắt đầu bằng "=" được lưu như chữ thường,
 * không bao giờ bị Google Sheets hiểu là công thức (chống formula injection từ nội dung CV/email).
 */
exports.appendRow = async (spreadsheetId, sheetName, row) => {
  // google-auth-library v10+ trả về đối tượng Headers: không dùng {...headers} vì sẽ làm mất Authorization
  const headers = new Headers(await getWriteHeaders());
  headers.set("Content-Type", "application/json");
  const range = `${quoteSheet(sheetName)}!A1`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ majorDimension: "ROWS", values: [row] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    if (res.status === 403) throw httpError(403, `Service Account ${exports.getServiceAccountEmail()} cần quyền Chỉnh sửa (Editor) trên Sheet để ghi dòng mới`);
    if (res.status === 404) throw httpError(404, "Không tìm thấy Google Sheet");
    if (res.status === 400) throw httpError(400, "Không ghi được: kiểm tra tên tab");
    throw httpError(502, `Google Sheets trả lỗi ${res.status}`);
  }
  return true;
};

exports.MAX_ROWS = MAX_ROWS;
