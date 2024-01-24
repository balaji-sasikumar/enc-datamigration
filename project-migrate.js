const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
let connectionString = require("./config").connectionString;
let questions = [
  {
    type: "input",
    name: "OldKey",
    message: "Enter Your Old Shared Key",
  },
  {
    type: "input",
    name: "NewKey",
    message: "Enter Your New Shared Key",
  },
  {
    type: "input",
    name: "companyId",
    message: "Enter Your Organization Id",
  },
];

inquirer.prompt(questions).then((answers) => {
  let oldKey = answers.OldKey;
  let newKey = answers.NewKey;
  count = 0;
  connectToDB(connectionString).then((db) => {
    console.log("connected to db");
    getProjects(answers.companyId).then((projects) => {
      console.log("projects", projects.length);
      projects.forEach((project) => {
        decryptProject(project, oldKey).then((project) => {
          count++;
          if (!project.invalid) {
            delete project.invalid;
            encryptProject(project, newKey).then((encryptedProject) => {
              updateProject(project._id, encryptedProject).then(() => {
                console.log(`Project ${count} encrypted & updated`);
              });
            });
          } else {
            console.log(`Project ${count} is invalid`);
          }
        });
      });
    });
  });
});

const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};

const getProjects = async (companyId) => {
  return await mongoose.connection.db
    .collection("projects")
    .find({
      companyid: companyId,
    })
    .toArray();
};

const updateProject = async (projectId, project) => {
  return await mongoose.connection.db
    .collection("projects")
    .updateOne({ _id: projectId }, { $set: project });
};

const encryptProject = async (project, key) => {
  project.title = encryptionAES(project.title, key);
  project.details = encryptionAES(project.details, key);
  project.group = project?.group?.map((group) => {
    group.title = encryptionAES(group.title, key);
    group.details = encryptionAES(group.details, key);
    if (group.type === "subproject") {
      group.group = group?.group?.map((task) => {
        task.title = encryptionAES(task.title, key);
        task.details = encryptionAES(task.details, key);
        task.comments = task?.comments?.map((comment) => {
          comment.comment = encryptionAES(comment.comment, key);
          return comment;
        });
        return task;
      });
    } else if (group.type === "task") {
      group.comments = group?.comments?.map((comment) => {
        comment.comment = encryptionAES(comment.comment, key);
        return comment;
      });
    }
    return group;
  });
  return project;
};
const decryptProject = async (project, key) => {
  project.title = decryptionAES(project.title, key);
  project.details = decryptionAES(project.details, key);
  project.invalid =
    project.title === "badformat" || project.details === "badformat";
  project.group = project?.group?.map((group) => {
    group.title = decryptionAES(group.title, key);
    group.details = decryptionAES(group.details, key);
    if (group.type === "subproject") {
      group.group = group?.group?.map((task) => {
        task.title = decryptionAES(task.title, key);
        task.details = decryptionAES(task.details, key);
        task.comments = task?.comments?.map((comment) => {
          comment.comment = decryptionAES(comment.comment, key);
          return comment;
        });
        return task;
      });
    } else if (group.type === "task") {
      group.comments = group?.comments?.map((comment) => {
        comment.comment = decryptionAES(comment.comment, key);
        return comment;
      });
    }
    return group;
  });
  return project;
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
