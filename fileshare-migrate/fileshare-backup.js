import { ShareServiceClient } from "@azure/storage-file-share";

const backupFolder = "backup"; // folder name which we have already created in the file share
let fileObjects = [];

const connStr = require("../config").storageCon;

const shareName = "migration-test";

const listFilesInShare = async (shareName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  try {
    const shareClient = shareServiceClient.getShareClient(shareName);

    const getFilesInDirectory = async (folderPath) => {
      let directoryClient = shareClient.getDirectoryClient(folderPath);
      for await (const item of directoryClient.listFilesAndDirectories()) {
        if (item.kind === "directory") {
          await getFilesInDirectory(
            folderPath !== "" ? folderPath + "/" + item.name : item.name
          );
        } else {
          fileObjects.push({
            directory: folderPath,
            fileName: item.name,
          });
        }
      }
    };
    await getFilesInDirectory("");
  } catch (error) {
    console.log(error);
  }
};

listFilesInShare(shareName);

const getFilesAndMoveToBackup = async () => {
  for (let fileObject of fileObjects) {
    let { directory, fileName } = fileObject;
    let fileData = await downloadFile(directory, fileName);
    let backupDirectory = `${backupFolder}/${directory}`;
    console.log(`Backing up file: ${directory}/${fileName}`);
    await uploadFile(backupDirectory, fileName, fileData);
    console.log(`File backed up: ${directory}/${fileName}`);
  }
};

const downloadFile = async (directory, fileName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const downloadResponse = await fileClient.download();
  let base64String = (
    await streamToBuffer(downloadResponse.readableStreamBody)
  ).toString("base64");
  return base64String;
};

const streamToBuffer = async (readableStream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
};

const uploadFile = async (directory, fileName, fileData) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  await createBackupFolder(directory);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  console.log(`Uploading file: ${directory}/${fileName}`);
  const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
  const uploadResponse = await fileClient.uploadData(buffer);
  return uploadResponse;
};

const createBackupFolder = async (folder) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  const directoryClient = shareClient.getDirectoryClient(folder);
  try {
    await directoryClient.createIfNotExists();
  } catch (error) {
    console.log(error);
  }
};

setTimeout(() => {
  getFilesAndMoveToBackup();
}, 5000);
