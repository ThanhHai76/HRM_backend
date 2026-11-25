// Ánh xạ tiêu đề cột (tiếng Việt) -> trường của ứng viên. Dùng chung cho nhập Excel và đồng bộ Google Sheet.
const keyMap = {
  "Nguồn": "source",
  "Ngày về/nhập CV": "cvDate",
  "Job": "job",
  "Họ và tên": "name",
  "Năm sinh": "birthYear",
  "Trình độ học vấn": "academicLevel",
  "Chuyên ngành": "specialized",
  "SĐT": "phone",
  "Địa chỉ mail": "email",
  "Link CV": "linkCV",
  "Link SP": "linkSP",
  "Link FB": "linkFB",
  "Đơn vị UV từng làm": "companyUV",
  "HR suggesst": "hrSuggest",
  "HR chấm": "hrMark",
  "Bộ phận chấm": "partMark",
  "Vòng 1": "round1",
  "Tham gia Vòng 1": "joinRound1",
  "Kết quả PV V1": "interviewV1",
  "VÒNG 2": "round2",
  "Tham gia Vòng 2": "joinRound2",
  "Kết qủa PV V2": "interviewV2",
  // Sheet gốc có hai cột "Notes"; trước đây cột "Notes" luôn được ánh xạ vào notes2 (khóa sau ghi đè khóa trước).
  "Notes": "notes2",
  "OFFER": "offer",
  "Kết quả offer": "offerResult",
  "ĐI LÀM": "goWork",
  "Ngày đi làm": "onboardDate",
  "THỬ VIỆC Thời gian": "probationTime",
  "Kết quả thử việc": "probationResult",
  "Note": "notes3",
};

const FIELDS = [...new Set(Object.values(keyMap))];

// Bỏ dấu + chữ thường + gộp khoảng trắng: để "SĐT", "sdt", "Số điện thoại"... dễ khớp hơn
const fold = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Tiêu đề khớp không phân biệt hoa/thường và dấu; thêm vài tên gọi phổ biến
const ALIASES = { "so dien thoai": "phone", "dien thoai": "phone", "sdt": "phone", "email": "email", "mail": "email", "ho ten": "name", "ten": "name" };
const foldedMap = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [fold(k), v]));

const resolveHeader = (header) => {
  const base = String(header || "").replace(/_\d+$/, ""); // bỏ hậu tố của tiêu đề trùng tên (_1, _2)
  const exact = keyMap[String(header || "")];
  if (exact) return exact;
  const f = fold(base);
  if (String(header || "") !== base) return null; // cột trùng tên thứ hai trở đi: bỏ qua
  return foldedMap[f] || ALIASES[f] || (FIELDS.includes(base) ? base : null);
};

const MAX_CELL = 5000;

// Chuyển một dòng {tiêu đề: giá trị} thành object ứng viên (bỏ cột không nhận diện được)
const mapRow = (row) => {
  const out = {};
  for (const header of Object.keys(row)) {
    const field = resolveHeader(header);
    if (!field) continue;
    const value = String(row[header] == null ? "" : row[header]).trim().slice(0, MAX_CELL);
    if (value !== "") out[field] = value;
  }
  return out;
};

module.exports = { keyMap, FIELDS, resolveHeader, mapRow, fold };
