const mongoose = require("mongoose");
const inquirer = require("inquirer");
const fs = require("fs");
let connectionString = require("./config").connectionString;
const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getUsers = async () => {
  return await mongoose.connection.db.collection("users").find().toArray();
};

connectToDB(connectionString).then((db) => {
  console.log("connected to db");
  getUsers().then(async (users) => {
    console.log("users", users.length);
    let usersList = [];
    for (let i = 0; i < users.length; i++) {
      let question = `Does this user ${users[i].name} chat have to be migrated?`;
      await inquirer
        .prompt([
          {
            type: "confirm",
            name: "migrate",
            message: question,
            default: false,
          },
        ])
        .then((answers) => {
          if (answers.migrate) {
            usersList.push(users[i]._id.toString());
          }
          if (i === users.length - 1) {
            fs.writeFileSync("usersList.json", JSON.stringify(usersList));
          }
        });
    }
  });
});
