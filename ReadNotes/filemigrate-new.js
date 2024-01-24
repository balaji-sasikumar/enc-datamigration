const { BlobServiceClient } = require("@azure/storage-blob");
const { storageAccount, storageAccessKey } = require("../config");
const fs = require("fs");
let CryptoJS = require("crypto-js");

const blobServiceClient = BlobServiceClient.fromConnectionString(
  `DefaultEndpointsProtocol=https;AccountName=${storageAccount};AccountKey=${storageAccessKey};EndpointSuffix=core.windows.net`
);

const chunkSize = 10 * 1024 * 1024;
const chunkSeparator = "###"; // Unique separator
const overWriteFile = async (containerName, blobName, content) => {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const uploadBlobResponse = await blockBlobClient.upload(
    content,
    content.length
  );
  return uploadBlobResponse;
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

const main = async (container, oldKey, newKey) => {
  container = container.toString();
  const containerClient = blobServiceClient.getContainerClient(container);
  for await (const blob of containerClient.listBlobsFlat()) {
    console.log("Processing", blob.name);
    const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
    const downloadBlockBlobResponse = await blockBlobClient.downloadToBuffer();
    const encryptedContent = downloadBlockBlobResponse.toString();
    const encryptedChunks = encryptedContent.split(chunkSeparator);
    const decryptedChunks = [];
    let hasBadformat = false;

    for (const encChunk of encryptedChunks) {
      const decChunk = decryptionAES(encChunk, oldKey);
      if (decChunk === "badformat") {
        hasBadformat = true;
        break;
      }
      decryptedChunks.push(decChunk);
    }
    const decryptedContent = decryptedChunks.join("");
    if (hasBadformat) {
      console.log("Invalid file", blob.name);
    } else {
      let content = encryptFile(decryptedContent, newKey);
      await overWriteFile(container, blob.name, content);
    }
  }
  console.log("done", container);
};

module.exports = main;
