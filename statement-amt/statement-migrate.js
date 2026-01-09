const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
let connectionString = require("./config").connectionString;
let questions = [
  {
    type: "input",
    name: "oldSharedKey",
    message: "Enter your Old shared key",
  },
  {
    type: "input",
    name: "newSharedKey",
    message: "Enter your New shared key",
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
      processStatements(statements, answers.oldSharedKey, answers.newSharedKey);
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

const decryptionAES = (msg, key) => {
  try {
    if (msg && key) {
      const bytes = CryptoJS.AES.decrypt(msg, key);
      const plaintext = bytes.toString(CryptoJS.enc.Utf8);
      return plaintext || "badformat";
    } else {
      return msg;
    }
  } catch (err) {
    return "badformat";
  }
};

const updateStatement = async (statementId, amount, statementName) => {
  await mongoose.connection.db.collection("statements").updateOne(
    { _id: statementId },
    {
      $set: {
        amount: amount,
        statementName: statementName,
      },
    }
  );
};

const processStatements = async (statements, oldKey, newKey) => {
  for (let i = 0; i < statements.length; i++) {
    const decryptedAmount = decryptionAES(statements[i].amount, oldKey);
    const decryptedStatementName = decryptionAES(
      statements[i].statementName,
      oldKey
    );

    if (
      decryptedAmount === "badformat" ||
      decryptedStatementName === "badformat"
    ) {
      console.log(`Statement ${i + 1} has bad format, skipping...`);
      continue;
    }

    const reEncryptedAmount = encryptionAES(decryptedAmount, newKey);
    const reEncryptedStatementName = encryptionAES(
      decryptedStatementName,
      newKey
    );

    await updateStatement(
      statements[i]._id,
      reEncryptedAmount,
      reEncryptedStatementName
    );
    console.log(`Statement ${i + 1} re-encrypted & updated`);
  }
};
