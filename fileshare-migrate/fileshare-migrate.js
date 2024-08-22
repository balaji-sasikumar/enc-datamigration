import { ShareServiceClient } from "@azure/storage-file-share";
import { createReadStream, createWriteStream, unlinkSync, mkdirSync } from "fs";
import { AES } from "crypto-ts";
import { createGzip } from "zlib";
import mime from "mime";

const chunkSize = 3 * 1024 * 1024;
const chunkSeparator = "###"; // Unique separator

const key = "Test@1234";
const connStr = "";

const fromFileshare = "source-fileshare";
const toFileshare = "to-share";

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
            // deleteFile(folderPath, item.name);
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

listFilesInShare(fromFileshare);

const downloadFile = async (directory, fileName) => {
  console.log("Downloading file: ", fileName);
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(fromFileshare);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const downloadResponse = await fileClient.download();
  mkdirSync("Downloads", { recursive: true });
  const readStream = downloadResponse.readableStreamBody;
  const writeStream = createWriteStream(`Downloads/${fileName}`);
  readStream.pipe(writeStream);
  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      console.log("File downloaded: ", directory + "/" + fileName);
      resolve();
    });
    writeStream.on("error", reject);
  });
};

const uploadFile = async (directory, fileName, filePath) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(toFileshare);
  if (directory !== "") await createParentFolder(directory);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const uploadResponse = await fileClient.uploadFile(filePath, {
    metadata: { stream: "true" },
  });
  return uploadResponse;
};

const createParentFolder = async (folder) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(toFileshare);

  const folderParts = folder.split("/");
  let currentPath = "";

  for (const part of folderParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const directoryClient = shareClient.getDirectoryClient(currentPath);

  try {
    await directoryClient.createIfNotExists();
  } catch (error) {
      console.log(`Error creating directory ${currentPath}:`, error);
      break; // stop creating further directories if an error occurs
    }
  }
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

const checkIfFileExists = async (directory, fileName) => {
  const shareServiceClient = ShareServiceClient.fromConnectionString(connStr);
  const shareClient = shareServiceClient.getShareClient(toFileshare);
  const directoryClient = shareClient.getDirectoryClient(directory);
  const fileClient = directoryClient.getFileClient(fileName);
  const exists = await fileClient.exists();
  return exists;
};

const encryptAndSaveFile = async (fromPath, toPath, key) => {
  try {
    return new Promise((resolve, reject) => {
      try {
        console.log("Encrypting file: ", fromPath);
        const readStream = createReadStream(fromPath, {
          highWaterMark: chunkSize,
        });
        const writeStream = createWriteStream(toPath);
        let firstChunk = true;
        let encChunk, chunkToEncrypt;
        readStream.on("data", (chunk) => {
          readStream.pause();
          if (firstChunk) {
            chunkToEncrypt = `data:${mime.getType(
              fromPath
            )};base64,${chunk.toString("base64")}`;
            firstChunk = false;
          } else {
            chunkToEncrypt = chunk.toString("base64");
          }
          encChunk = encryptionAES(chunkToEncrypt, key);
          writeStream.write(encChunk + chunkSeparator, () => {
            readStream.resume();
          });
        });

        readStream.on("end", () => {
          writeStream.end();
          resolve();
        });

        readStream.on("error", (error) => {
          reject(error);
        });

        writeStream.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (err) {
    console.error("Error writing file:", err);
  }
};

setTimeout(async () => {
  mkdirSync("EncryptedFiles", { recursive: true });
  mkdirSync("CompressedFiles", { recursive: true });

  for (const fileObject of fileObjects) {
    try {
      if (
        await checkIfFileExists(
          fileObject.directory,
          fileObject.fileName + ".txt.gz"
        )
      ) {
        console.log(
          "File already exists: ",
          fileObject.directory + "/" + fileObject.fileName
        );
        continue;
      }
      await downloadFile(fileObject.directory, fileObject.fileName);
    let encryptedPath = "EncryptedFiles/" + fileObject.fileName + ".txt";
      await encryptAndSaveFile(
        `Downloads/${fileObject.fileName}`,
        encryptedPath,
        key
      );
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
      unlinkSync(`Downloads/${fileObject.fileName}`);
    unlinkSync(encryptedPath);
    unlinkSync(compressedPath);
    } catch (error) {
      console.log(error, fileObject);
    }
  }
}, 2000);
