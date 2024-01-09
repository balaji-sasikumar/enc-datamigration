const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
const fs = require("fs");
let connectionString = require("./config").connectionString;

let questions = [
  {
    type: "input",
    name: "sharedKey",
    message: "Enter your shared key",
  },
];

inquirer.prompt(questions).then((answers) => {
  connectToDB(connectionString).then((db) => {
    console.log("connected to db");
    getChats(answers.companyId).then((chats) => {
      console.log("chats", chats.length, answers.sharedKey);
      for (let i = 0; i < chats.length; i++) {
        chats[i].chats.forEach((element) => {
          element.message = encryptionAES(element.message, answers.sharedKey);
        });
        updateChat(chats[i]._id, chats[i].chats).then(() => {
          console.log(`Chat ${i + 1} encrypted & updated`);
        });
      }
    });
  });
});
const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getChats = async () => {
  let users = fs.readFileSync("usersList.json", "utf8");
  return await mongoose.connection.db
    .collection("chats")
    .find({ users: { $in: JSON.parse(users) } })
    .toArray();
};

const encryptionAES = (msg, key) => {
  if (msg && key) {
    return CryptoJS.AES.encrypt(msg, key).toString();
  } else {
    return msg;
  }
};

const updateChat = async (chatId, chats) => {
  await mongoose.connection.db.collection("chats").updateOne(
    { _id: chatId },
    {
      $set: {
        chats: chats,
      },
    }
  );
};
