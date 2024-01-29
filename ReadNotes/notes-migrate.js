const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
let connectionString = require("../config").connectionString;
let fs = require("fs");
const main = require("./filemigrate-new");
let questions = [
  {
    type: "input",
    name: "oldSharedKey",
    message: "Enter your old shared key",
  },
  {
    type: "input",
    name: "newSharedKey",
    message: "Enter your new shared key",
  },
];
let users = {
  "61482e82096e18002fb74008": {
    oldPrivateKey: "123",
    newPrivateKey: "balaji",
  },

  "619cbdf9687d5e0031f10dfc": {
    oldPrivateKey: "123",
    newPrivateKey: "dinesh",
  },
};
inquirer.prompt(questions).then((answers) => {
  fs.writeFileSync("noteIds.json", JSON.stringify([]));
  connectToDB(connectionString).then((db) => {
    console.log("connected to db");
    getNotes().then(async (notes) => {
      console.log("notes", notes.length);
      let sharedNotes = notes.filter((note) => {
        return note.users.length > 0;
      });
      console.log("shared notes", sharedNotes.length);
      let privateNotes = notes.filter((note) => {
        return note.users.length === 0;
      });

      await Promise.all([
        processNotes(sharedNotes, answers.oldSharedKey, answers.newSharedKey),
        ...Object.keys(users).map((userId) =>
          processNotes(
            privateNotes.filter((note) => note.userid === userId),
            users[userId].oldPrivateKey,
            users[userId].newPrivateKey
          )
        ),
      ]);

      console.log("all notes encrypted");
    });
  });
});
const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getNotes = async () => {
  return await mongoose.connection.db
    .collection("notes")
    .find({
      $or: [
        { userid: { $in: Object.keys(users) } },
        { users: { $elemMatch: { $in: Object.keys(users) } } },
      ],
    })
    .toArray();
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

const encryptionAES = (msg, key) => {
  if (msg && key) {
    return CryptoJS.AES.encrypt(msg, key).toString();
  } else {
    return msg;
  }
};

const updateNote = async (noteId, note) => {
  return await mongoose.connection.db
    .collection("notes")
    .updateOne({ _id: noteId }, { $set: note });
};

const decryptNote = async (note, key) => {
  note.title = decryptionAES(note.title, key);
  note.details = decryptionAES(note.details, key);
  note.invalid = note.title === "badformat" || note.details === "badformat";
  return note;
};

const encryptNote = async (note, key) => {
  note.title = encryptionAES(note.title, key);
  note.details = encryptionAES(note.details, key);
  return note;
};

const processNotes = async (notes, oldKey, newKey) => {
  let count = 0;
  for (const note of notes) {
    try {
      const decryptedNote = await decryptNote(note, oldKey);

      if (decryptedNote.invalid) {
        console.log("Invalid note", decryptedNote._id);
      } else {
        const noteIds = JSON.parse(fs.readFileSync("noteIds.json"));
        fs.writeFileSync(
          "noteIds.json",
          JSON.stringify(noteIds.concat(decryptedNote._id))
        );

        const encryptedNote = await encryptNote(decryptedNote, newKey);
        await updateNote(note._id, encryptedNote);
        await main(note._id, oldKey, newKey);
        count++;
        console.log(`Note ${note._id} encrypted & updated ${count}`);
      }
    } catch (error) {
      console.error("Error processing note:", error);
    }
  }
};
