const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
let connectionString = require("./config").connectionString;
let questions = [
  {
    type: "input",
    name: "sharedKey",
    message: "Enter your shared key",
  },
  {
    type: "input",
    name: "companyId",
    message: "Enter your company id",
  },
];

inquirer.prompt(questions).then((answers) => {
  connectToDB(connectionString).then((db) => {
    console.log("connected to db");
    getStatements(answers.companyId).then((statements) => {
      console.log(`Retrieved ${statements.length} statements`);
      for (let i = 0; i < statements.length; i++) {
        statements[i].amount = encryptionAES(
          String(statements[i].amount),
          answers.sharedKey
        );
        updateStatement(statements[i]._id, statements[i].amount).then((res) => {
          console.log(`Statement ${i + 1} encrypted & updated`, res);
        });
      }
    });
  });
});
const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getStatements = async (companyId) => {
  return await mongoose.connection.db
    .collection("statements")
    .find({ companyid: companyId })
    .toArray();
};

const encryptionAES = (msg, key) => {
  if (msg && key) {
    return CryptoJS.AES.encrypt(msg, key).toString();
  } else {
    return msg;
  }
};

const updateStatement = async (statementId, amount) => {
  await mongoose.connection.db.collection("statements").updateOne(
    { _id: statementId },
    {
      $set: {
        amount: amount,
      },
    }
  );
};
