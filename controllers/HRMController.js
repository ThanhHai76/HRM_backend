const fs = require("fs");
const PDFParser = require("pdf2json");
const parseFullName  = require('parse-full-name').parseFullName;

const HRMService = require("../services/HRMService");

const pdfParse = require("pdf-parse");

const HRMModel = require("../models/HRM");
const async = require("async");
const { readFirstSheet } = require("../utils/readExcel");

const moment = require('moment'); 

const { createWorker } = require('tesseract.js');

const { keyMap } = require("../utils/employeeColumns");

const { insertMany } = require("../services/HRMService");
const { log } = require("console");

const convertTimeMiliseconds = (time) => {
  const timeAfterParse = moment(time, "DD MM YYYY");
  return moment(timeAfterParse).valueOf();
}

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
        partMark: item.partMark,
        hasCvProfile: !!item.cvProfile,
        hasCvFile: !!item.cvFileId,
      };
    });
    res.json({ data: HRMFilters, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllEmployeesCVHome = async (req, res) => {
  try {
    const HRM = await HRMService.getAllHRM();
    const hrmResponse = HRM.map((item) => {
      return {
        _id: item._id,
        cvDate: item.cvDate,
        job: item.job,
        source: item.source,
        birthYear: item.birthYear,
        partMark: item.partMark,
        goWork: item.goWork,
        joinRound1: item.joinRound1,
        interviewV1: item.interviewV1,
        probationResult: item.probationResult,
      };
    });
    res.json({ data: hrmResponse, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.reportCurrentYear = async (req, res) => {
  try {
    const HRM = await HRMService.getAllHRM();
    const trimWord = (`/${req.body.year}`).toUpperCase().trim();
    const HRMFilters = HRM.filter((item) => (item.cvDate || "").toUpperCase().includes(trimWord));
    res.json({ data: HRMFilters, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

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

exports.uploadControllerPost = async (req, res) => {
  try {
    const xlData = await readFirstSheet(req.file.path);

    const dataMap = xlData.map((item) => {
      const dataObject = {};
      for (const header in item) {
        // Bỏ qua cột không có trong keyMap
        if (keyMap[header]) dataObject[keyMap[header]] = item[header];
      }
      return dataObject;
    });

    const dataInsert = dataMap.filter((item) => item.source || item.phone);

    await insertMany(dataInsert);
    res.status(201).render("success");
  } catch (err) {
    res.status(400).json({ error: "Không đọc được file Excel: " + err.message });
  }
};

exports.uploadErrorController = (error, req, res, next) => {
  res.status(400).send({
    error: error.message,
  });
};

const detechName = (text) => {
  const lastNames = ['Nguyễn', 'Nguyen', 'Trần', 'Tran', 'Phạm', 'Pham', 'Vũ', 'Vu', 'Hứa', 'Hua', 'Hoàng', 'Hoang',
  'Bùi', 'Bui', 'Lê', 'Le', 'Đỗ', 'Do', 'Tạ', 'Ta', 'Hà', 'Ha' , 'Đinh', 'Dinh', 'Phan', 'Phan', 'Biên', 'Bien', 'Mai', 
  'Bạch', 'Bach', 'Đàm', 'Dam', 'Ngô', 'Ngo', 'Đào', 'Dao', 'Cao', 'Đoàn', 'Doan', 'Lại', 'Lai', 'Tôn', 'Ton', 
  'Phí', 'Phi', 'Dương', 'Duong', 'Đặng', 'Dang', 'Huỳnh', 'Huynh', 'Khuất', 'Khuat' ,'Chu', 'Hồ', 'Ho', 'Trịnh', 'Trinh']

  const checkName = lastNames.some(name => text.toUpperCase().includes(name.toUpperCase()));
  return checkName;
}

exports.uploadPDFController = (req, res) => {
  let pdfParser = new PDFParser(this, 1);

  let dataCV = {};

  pdfParser.on("pdfParser_dataError", (errData) =>
    console.error(errData.parserError)
  );
  pdfParser.on("pdfParser_dataReady", (pdfData) => {
    const content = pdfParser.getRawTextContent();
    // const dataCV = extractCVData(content);
    console.log(extractCandidateInfo(content));

    // content.map((row) => {
    //   const stringPhone = row.substring(1, row.length - 1);
    //   if (validatePhoneNumber(stringPhone)) {dataCV.phone = stringPhone; console.log(stringPhone);}
    // })
  });

  pdfParser.loadPDF(req.file.path);
};

function validatePhoneNumber(input_str) {
  var re = /^\(?(\d{3})\)?[- ]?(\d{3})[- ]?(\d{4})$/;
  return re.test(input_str);
}

function detectVietnameseNames(text) {
  const nameRegex = /[\p{L}\p{M}]+/gu;

  const matches = text.match(nameRegex);

  const commonWords = ['và', 'của', 'trong', 'cho', 'tới', 'ở', 'bởi', 'cùng', 'tại'];
  const names = matches.filter(name => name.length > 1 && !commonWords.includes(name.toLowerCase()));

  return names;
}

async function extractTextFromPDF(pdfFilePath) {
  const worker = await createWorker("eng");
  const { data: { text } } = await worker.recognize(pdfFilePath);
  await worker.terminate();
  return text;
}

// Function to extract CV data using regex patterns
function extractCVData(text) {
  const cvData = {};

  // Extract name
  const nameRegex = /(?<=Name:\s)(.*)/i;
  const nameMatch = text.match(nameRegex);
  cvData.name = nameMatch ? nameMatch[0].trim() : '';

  // Extract email
  const emailRegex = /(?<=Email:\s)(.*)/i;
  const emailMatch = text.match(emailRegex);
  cvData.email = emailMatch ? emailMatch[0].trim() : '';

  // Extract phone number
  const phoneRegex = /(?<=Phone:\s)(.*)/i;
  const phoneMatch = text.match(phoneRegex);
  cvData.phone = phoneMatch ? phoneMatch[0].trim() : '';

  // Extract skills
  const skillsRegex = /(?<=Skills:\s)(.*)/i;
  const skillsMatch = text.match(skillsRegex);
  cvData.skills = skillsMatch ? skillsMatch[0].split(',').map(skill => skill.trim()) : [];

  // Extract education
  const educationRegex = /(?<=Education:\s)(.*)/i;
  const educationMatch = text.match(educationRegex);
  cvData.education = educationMatch ? educationMatch[0].trim() : '';

  // Extract work experience
  const experienceRegex = /(?<=Experience:\s)(.*)/i;
  const experienceMatch = text.match(experienceRegex);
  cvData.experience = experienceMatch ? experienceMatch[0].trim() : '';

  return cvData;
}

function extractDataPdfVN(text) {

  // Split the text into sections
  const sections = text.split('\n\n');

  // Initialize the CV data object
  const cvData = {
    name: '',
    contact: {
      email: '',
      phone: '',
      address: ''
    },
    workExperience: [],
    education: [],
    skills: []
  };

  // Parse the sections and extract the relevant information
  for (const section of sections) {
    if (section.startsWith('Họ và tên:')) {
      const name = parseFullName(section.split(':')[1].trim());
      cvData.name = name;
    } else if (section.startsWith('Thông tin liên hệ:')) {
      const contactInfo = section.split(':')[1].trim().split(',');
      for (const info of contactInfo) {
        const [key, value] = info.split(':').map(item => item.trim());
        if (key.toLowerCase() === 'email') {
          cvData.contact.email = value;
        } else if (key.toLowerCase() === 'sđt') {
          cvData.contact.phone = value;
        } else if (key.toLowerCase() === 'địa chỉ') {
          cvData.contact.address = value;
        }
      }
    } else if (section.startsWith('Kinh nghiệm làm việc:')) {
      const experiences = section.split(':')[1].trim().split('\n');
      for (const experience of experiences) {
        if (experience.trim() !== '') {
          const [company, jobTitle, dates] = experience.split(' - ');
          cvData.workExperience.push({
            company,
            jobTitle,
            dates
          });
        }
      }
    } else if (section.startsWith('Học vấn:')) {
      const education = section.split(':')[1].trim().split('\n');
      for (const edu of education) {
        if (edu.trim() !== '') {
          const [degree, institution, graduationYear] = edu.split(', ');
          cvData.education.push({
            degree,
            institution,
            graduationYear
          });
        }
      }
    } else if (section.startsWith('Kỹ năng:')) {
      const skills = section.split(':')[1].trim().split(', ');
      cvData.skills = skills;
    }
  }

  return cvData;
}

function extractCandidateInfo(text) {
  const normalized = text.replace(/\r/g, "").trim();

  // --- Name ---
  // Lấy dòng in hoa toàn bộ, dài từ 2 từ trở lên
  let name = normalized.match(/(?:^|\n)([A-ZÀ-ỸĐ\s]{5,})(?:\n|$)/)?.[1].trim()
           || normalized.match(/Ứng viên:\s*([^\|]+)/i)?.[1].trim()
           || "N/A";

  // --- Email ---
  let email = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/)?.[0] || "N/A";

  // --- Phone ---
  let phone = normalized.match(/(\+?84|0)\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}/)?.[0]
           || "N/A";

  // --- Skills ---
  let skillsSection = (normalized.match(/SKILLS([\s\S]*?)EDUCATION/i)?.[1] || "").toLowerCase();
  const skillKeywords = [
    "c/c++", "c#", "java", "javascript", "html", "css", "js", "sql",
    "springboot", "asp.net", "bootstrap", "mysql", "wordpress",
    "android studio", "github", "canva", "capcut", "vmware", "virtual box"
  ];
  let skills = skillKeywords.filter(skill => skillsSection.includes(skill));

  // --- Experience ---
  const expRegex = /(\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{4}.*)/g;
  let experience = [];
  let match;
  while ((match = expRegex.exec(normalized)) !== null) {
    experience.push(match[0].trim());
  }

  return { name, email, phone, skills, experience };
}



