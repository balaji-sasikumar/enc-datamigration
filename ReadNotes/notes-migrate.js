const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
let connectionString = require("../config").connectionString;
let fs = require("fs");
let questions = [
  {
    type: "input",
    name: "oldSharedKey",
    message: "Enter your shared key",
  },
  {
    type: "input",
    name: "newSharedKey",
    message: "Enter your shared key",
  },
];
inquirer.prompt(questions).then((answers) => {
  connectToDB(connectionString).then((db) => {
    console.log("connected to db");
    getNotes(answers.companyId).then((notes) => {
      console.log("notes", notes.length);
      notes = notes.filter((note) => {
        return note.users.length > 0;
      });
      console.log("shared notes", notes.length);
      notes.forEach((note) => {
        if (note.users.length > 0) {
          decryptNote(note, answers.oldSharedKey).then((decryptedNote) => {
            if (decryptedNote.invalid) {
              console.log("invalid note", decryptedNote._id);
            } else {
              let noteIds = JSON.parse(fs.readFileSync("noteIds.json"));
              fs.writeFileSync(
                "noteIds.json",
                JSON.stringify(noteIds.concat(decryptedNote._id))
              );
              encryptNote(decryptedNote, answers.newSharedKey).then(
                (encryptedNote) => {
                  updateNote(note._id, encryptedNote).then(() => {
                    console.log(`Note ${note._id} encrypted & updated`);
                  });
                }
              );
            }
          });
        }
      });
    });
  });
});
const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getNotes = async () => {
  return await mongoose.connection.db.collection("notes").find({}).toArray();
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
