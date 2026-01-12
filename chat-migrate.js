const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
const fs = require("fs");
const { main } = require("./ReadNotes/filemigrate-new");
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
];

inquirer.prompt(questions).then(async (answers) => {
  const db = await connectToDB(connectionString);
  console.log("connected to db");
  const chats = await getChats();
  console.log("chats to process:", chats.length);
  for (let i = 0; i < chats.length; i++) {
    chats[i].chats.forEach((element) => {
      let decryptedMessage = decryptionAES(
        element.message,
        answers.oldSharedKey
      );
      if (decryptedMessage === "badformat") {
        console.log(`Chat ${i + 1} has invalid message format`);
        return;
      }
      element.message = encryptionAES(decryptedMessage, answers.newSharedKey);
    });
    await updateChat(chats[i]._id, chats[i].chats);
    await main(chats[i]._id, answers.oldSharedKey, answers.newSharedKey);
    console.log(`Chat ${i + 1} encrypted & updated`);
  }
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
