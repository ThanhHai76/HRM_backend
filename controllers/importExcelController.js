const excelToJson = require("convert-excel-to-json");
const { insertMany } = require("../services/HRMService");
const fs = require("fs");

// Import Excel File to MongoDB database
exports.importExcelData2MongoDB = (filePath) => {
  console.log(filePath);
  // -> Read Excel File to Json Data
  const excelData = excelToJson({
    sourceFile: filePath,
    sheets: [
      {
        // Excel Sheet Name
        name: "testUploadExcel",

        // Header Row -> be skipped and will not be present at our result object.
        header: {
          rows: 1,
        },

        // Mapping columns to keys
        columnToKey: {
          A: "_id",
          B: "name",
          C: "email",
          D: "phone",
          E: "image",
          F: "cvLinkPDF",
          G: "createdAt"
        },
      },
    ],
  });

  // -> Log Excel Data to Console
  console.log('excelData', excelData);

  /**
    { 
        Customers:
        [ 
            { _id: 1, name: 'Jack Smith', address: 'Massachusetts', age: 23 },
            { _id: 2, name: 'Adam Johnson', address: 'New York', age: 27 },
            { _id: 3, name: 'Katherin Carter', address: 'Washington DC', age: 26 },
            { _id: 4, name: 'Jack London', address: 'Nevada', age: 33 },
            { _id: 5, name: 'Jason Bourne', address: 'California', age: 36 } 
        ] 
    }
    */

  // Insert Json-Object to MongoDB
  insertMany(excelData);

  fs.unlinkSync(filePath);
};