const inquirer = require("inquirer");
let CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
// const { main, backupContainer } = require("./ReadNotes/filemigrate-new");
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
  connectToDB(connectionString).then(async () => {
    console.log("connected to db");
    const projects = await getProjects(answers.companyId);
    // await backupProjects(projects);
    console.log("projects", projects.length);
    for (const project of projects) {
      const decryptedProject = await decryptProject(project, oldKey);
      count++;
      if (!decryptedProject.invalid) {
        delete decryptedProject.invalid;
        const encryptedProject = await encryptProject(decryptedProject, newKey);
        await updateProject(decryptedProject._id, encryptedProject);
        // await backupContainer(project._id);
        // await main(project._id, oldKey, newKey);
        console.log(`Project ${count} encrypted & updated`);
      } else {
        console.log(`Project ${count} is invalid`);
      }
    }
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

const backupProjects = async (projects) => {
  const backupCollection = mongoose.connection.db.collection("projects_backup");
  await backupCollection.insertMany(
    projects.map((p) => ({
      ...p,
      _backupAt: new Date(),
    }))
  );
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
