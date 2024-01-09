const mongoose = require("mongoose");
let connectionString = require("../config").connectionString;

const connectToDB = async (connectionString) => {
  return await mongoose.connect(connectionString);
};
let userId = "63f60dd0afd9f200112090fc";
const getProjects = async () => {
  return await mongoose.connection.db
    .collection("projects")
    .find({
      $or: [
        { users: userId },
        { "group.users": userId },
        {
          "group.group.users": userId,
        },
      ],
    })
    .toArray();
};

const updateProject = async (projectId, project) => {
  return await mongoose.connection.db
    .collection("projects")
    .updateOne({ _id: projectId }, { $set: project });
};

connectToDB(connectionString).then(async () => {
  const projects = await getProjects();
  const createdProjects = await getProjectsOrTasks(userId);
  console.log("Project Count Created by this userId", createdProjects.length);
  console.log("Project Count Assigned to this userId", projects.length);
  projects.forEach(async (project) => {
    project = removeUser(project, userId);
    await updateProject(project._id, project);
    console.log(`Project ${project._id} updated`);
  });
});

const removeUser = (project, userId) => {
  project.users = project.users.filter((user) => user !== userId);
  project.group = project?.group?.map((group) => {
    group.users = group.users.filter((user) => user !== userId);
    group.group = group?.group?.map((task) => {
      task.users = task.users.filter((user) => user !== userId);
      return task;
    });
    return group;
  });
  return project;
};

const getProjectsOrTasks = async (userId) => {
  return await mongoose.connection.db
    .collection("projects")
    .find({
      $or: [
        { userid: userId },
        { "group.userid": userId },
        {
          "group.group.userid": userId,
        },
      ],
    })
    .toArray();
};
