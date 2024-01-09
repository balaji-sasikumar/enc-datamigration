let mssql = require("mssql");
let fs = require("fs");
const { sqlConnectionString } = require("./config");

const connect = async () => {
  await mssql.connect(sqlConnectionString);
};

const readCSV = async () => {
  return new Promise((resolve, reject) => {
    fs.readFile(
      "LCODepositLedgerReport_2024-01-0512_01_02-0-1000000.csv",
      "utf8",
      (err, data) => {
        if (err) {
          reject(err);
        }
        resolve(data);
      }
    );
  });
};

connect().then(async () => {
  let csvData = await readCSV();
  let rows = csvData.split("\n");
  let columns = rows[0]
    .split(",")
    .map((column) => column.replace(/^"(.*)"$/, "$1"));
  let values = [];
  console.log(rows.length);
  for (let i = 1000; i < 1900; i++) {
    let row = rows[i].split(",");
    let value = [];

    for (let j = 0; j < row.length; j++) {
      // Remove double quotes around each value
      let cleanedValue = row[j].replace(/^"(.*)"$/, "$1");

      // Check if the column should be parsed as an integer or a date
      if (["SNo", "credit", "debit", "closing_balance"].includes(columns[j])) {
        value.push(parseInt(cleanedValue, 10));
      } else if (columns[j] === "date") {
        value.push(cleanedValue); // Date remains as a string
      } else {
        value.push(cleanedValue);
      }
    }

    values.push(value);
  }

  let query = `INSERT INTO [dbo].[TransactionHistory] (${columns.join(
    ","
  )}) VALUES `;

  for (let i = 0; i < values.length; i++) {
    let value = values[i];

    // Format the values based on their types
    let formattedValues = value.map((val) => {
      if (typeof val === "string") {
        return `'${val}'`;
      } else if (isNaN(val)) {
        return "NULL";
      } else {
        return val;
      }
    });

    query += `(${formattedValues.join(",")})`;

    if (i !== values.length - 1) {
      query += ",";
    }
  }

  //   console.log(query);
  await mssql.query(query);
  console.log("done");
});
