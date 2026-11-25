const ExcelJS = require("exceljs");

const pad = (n) => String(n).padStart(2, "0");

// Chuẩn hóa giá trị ô thành chuỗi hiển thị (ngày -> DD/MM/YYYY như cách dữ liệu cũ đang lưu)
const valueToText = (v) => {
  if (v == null) return "";
  if (v instanceof Date) {
    return `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v.richText)) return v.richText.map((part) => part.text || "").join("");
  if ("result" in v) return valueToText(v.result); // ô công thức
  if ("text" in v) return valueToText(v.text); // hyperlink
  return ""; // lỗi (#N/A...) và kiểu không hỗ trợ
};
const cellText = (cell) => valueToText(cell.value).trim();

/**
 * Đọc sheet đầu tiên của file .xlsx thành mảng object, khóa là tiêu đề ở dòng 1.
 * Bỏ qua dòng trống và ô trống. Thay thế thư viện xlsx (có lỗ hổng prototype pollution / ReDoS chưa có bản vá trên npm).
 */
exports.readFirstSheet = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  // Tiêu đề trùng tên được đánh hậu tố _1, _2... (giống thư viện xlsx cũ) để cột đầu tiên không bị ghi đè
  const headers = [];
  const seen = {};
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const name = cellText(cell);
    if (!name) return;
    const count = seen[name] || 0;
    seen[name] = count + 1;
    headers[col] = count === 0 ? name : `${name}_${count}`;
  });

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    // Object.create(null) + bỏ khóa nguy hiểm: không bao giờ gán vào __proto__
    const record = Object.create(null);
    let hasValue = false;
    headers.forEach((name, col) => {
      if (!name || name === "__proto__" || name === "constructor" || name === "prototype") return;
      const text = cellText(row.getCell(col));
      if (text !== "") {
        record[name] = text;
        hasValue = true;
      }
    });
    if (hasValue) rows.push({ ...record });
  });
  return rows;
};
