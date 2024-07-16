import { ShareServiceClient } from "@azure/storage-file-share";
import {
  writeFileSync,
  createReadStream,
  createWriteStream,
  unlinkSync,
  mkdirSync,
} from "fs";
import { AES } from "crypto-ts";
import { createGzip } from "zlib";
import mime from "mime";

const chunkSize = 10 * 1024 * 1024;
const chunkSeparator = "###"; // Unique separator

const key = "Test@1234";
const connStr = require("../config").storageCon;
const shareName = "migration-test"; // Name of the share to migrate

let fileObjects = [];

const listFilesInShare = async (shareName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  try {
    const shareClient = shareServiceClient.getShareClient(shareName);

    const getFilesInDirectory = async (folderPath) => {
      let directoryClient = shareClient.getDirectoryClient(folderPath);
      for await (const item of directoryClient.listFilesAndDirectories()) {
        if (item.name === "backup") continue; // Skip backup folder (if exists)

        if (item.kind === "directory") {
          await getFilesInDirectory(
            folderPath !== "" ? folderPath + "/" + item.name : item.name
          );
        } else {
          if (item.name.startsWith("._") || item.name == ".DS_Store") {
            deleteFile(folderPath, item.name);
            continue; // Skip files starting with "._"
          }
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

async function streamToBuffer(readableStream) {
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
}

const downloadFile = async (directory, fileName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  let mimeType = mime.getType(fileName);
  const downloadResponse = await fileClient.download();
  let base64String = (
    await streamToBuffer(downloadResponse.readableStreamBody)
  ).toString("base64");
  return convertToDataUrl(base64String, mimeType);
};

const convertToDataUrl = (content, mimeType) => {
  return `data:${mimeType};base64,${content}`;
};

const uploadFile = async (directory, fileName, filePath) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const uploadResponse = await fileClient.uploadFile(filePath);
  return uploadResponse;
};

const deleteFile = async (directory, fileName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(shareName);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const deleteResponse = await fileClient.deleteIfExists();
  return deleteResponse;
};

const encryptFile = (fileDataUrl, key) => {
  const encryptedChunks = [];
  const totalChunks = Math.ceil(fileDataUrl.length / chunkSize);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = start + chunkSize;
    const chunk = fileDataUrl.substring(start, end);

    const encChunk = encryptionAES(chunk, key);
    encryptedChunks.push(encChunk);
  }

  const joinedEncryptedData = encryptedChunks.join(chunkSeparator);
  return joinedEncryptedData;
};
const encryptionAES = (msg, key) => {
  if (msg && key) {
    return AES.encrypt(msg, key).toString();
  } else {
    return msg;
  }
};

const compressFile = async (inputFilePath, outputFilePath) => {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(inputFilePath);
    const writeStream = createWriteStream(outputFilePath);
    const gzip = createGzip();

    readStream.pipe(gzip).pipe(writeStream);

    writeStream.on("finish", () => {
      resolve();
    });

    writeStream.on("error", (err) => {
      reject(err);
    });
  });
};

setTimeout(async () => {
  mkdirSync("EncryptedFiles", { recursive: true });
  mkdirSync("CompressedFiles", { recursive: true });

  for (const fileObject of fileObjects) {
    let content = await downloadFile(fileObject.directory, fileObject.fileName);
    let encryptedContent = encryptFile(content, key);
    let encryptedPath = "EncryptedFiles/" + fileObject.fileName + ".txt";
    writeFileSync(encryptedPath, encryptedContent);
    let compressedPath = "CompressedFiles/" + fileObject.fileName + ".txt.gz";
    await compressFile(encryptedPath, compressedPath);
    await uploadFile(
      fileObject.directory,
      fileObject.fileName + ".txt.gz",
      compressedPath
    );
    console.log(
      "File uploaded: ",
      fileObject.directory + "/" + fileObject.fileName
    );
    unlinkSync(encryptedPath);
    unlinkSync(compressedPath);
    await deleteFile(fileObject.directory, fileObject.fileName);
  }
}, 2000);
