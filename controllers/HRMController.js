const fs = require("fs");
const PDFParser = require("pdf2json");

const HRMService = require("../services/HRMService");
const { importExcelData2MongoDB } = require("./importExcelController");

const HRMModel = require("../models/HRM");
const async = require("async");
const xlsx = require("xlsx");

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
  "Notes": "notes",
  "OFFER": "offer",
  "Kết quả offer": "offerResult",
  "Notes": "notes2",
  "ĐI LÀM": "goWork",
  "Ngày đi làm": "onboardDate",
  "THỬ VIỆC Thời gian": "probationTime",
  "Kết quả thử việc": "probationResult",
  "Note": "notes3",
};

const { insertMany } = require("../services/HRMService");

exports.getAllHRM = async (req, res) => {
  try {
    const HRM = await HRMService.getAllHRM();
    const HRMFilters = HRM.map((item) => {
      return {
        _id: item._id,
        source: item.source,
        cvDate: item.cvDate,
        job: item.job,
        name: item.name,
        birthYear: item.birthYear,
        academicLevel: item.academicLevel,
        specialized: item.specialized,
        phone: item.phone,
        email: item.email,
        hrSuggest: item.hrSuggest,
        hrMark: item.hrMark,
      };
    });
    res.json({ data: HRMFilters, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createHRM = async (req, res) => {
  try {
    const HRM = await HRMService.createHRM(req.body);
    res.json({ data: HRM, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getHRMById = async (req, res) => {
  try {
    const HRM = await HRMService.getHRMById(req.params.id);
    res.json({ data: HRM, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getHRMByPhone = async (req, res) => {
  try {
    const HRM = await HRMService.getHRMByPhone(req.body.phone);
    res.json({ data: HRM, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateHRM = async (req, res) => {
  try {
    const HRM = await HRMService.updateHRM(req.params.id, req.body);
    res.json({ data: HRM, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteHRM = async (req, res) => {
  try {
    const HRM = await HRMService.deleteHRM(req.params.id);
    res.json({ data: HRM, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadExcel = (req, res) => {
  importExcelData2MongoDB("../public/uploads" + req.file.filename);
};

const checkDuplicacy = async (employee, callback) => {
  try {
    //Duplicacy check for each row against the database
    const emp = await HRMModel.findOne({ Email: employee.Email }).exec();

    if (!emp) {
      const data = new HRMModel(employee);
      await data.save();
      return callback();
    }

    callback();
  } catch (error) {
    console.log(error);
  }
};

exports.uploadControllerGet = (req, res) => {
  res.render("index");
};

exports.uploadControllerPost = (req, res) => {
  const workBook = xlsx.readFile(req.file.path);
  const sheet_namelist = workBook.SheetNames;
  let xlData = xlsx.utils.sheet_to_json(workBook.Sheets[sheet_namelist], {
    raw: false,
  });

  const dataMap = xlData.map((item) => {
    const dataObject = {};
    for (const iterator in item) {
      dataObject[keyMap[iterator]] = item[iterator];
    }
    return dataObject;
  });

  insertMany(dataMap).then(() => res.status(201).render("success"));
};

exports.uploadPDFController = (req, res) => {
  // const pdfParser = new PDFParser();

  // pdfParser.on("pdfParser_dataError", (errData) =>
  //   console.error(errData.parserError)
  // );
  // pdfParser.on("pdfParser_dataReady", (pdfData) => {
  //   fs.writeFile("../uploads/pdfTest.json", JSON.stringify(pdfData));
  // });

  // pdfParser.loadPDF(req.file.path);

  let pdfParser = new PDFParser(this, 1);

  pdfParser.on("pdfParser_dataError", (errData) =>
    console.error(errData.parserError)
  );
  pdfParser.on("pdfParser_dataReady", (pdfData) => {
    console.log(pdfParser.getRawTextContent().split("\n")[0]);
  });

  pdfParser.loadPDF(req.file.path);
};

exports.uploadErrorController = (error, req, res, next) => {
  res.status(400).send({
    error: error.message,
  });
};
