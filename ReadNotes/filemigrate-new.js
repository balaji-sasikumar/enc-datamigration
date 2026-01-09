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

const backupContainer = async (containerName) => {
  containerName = containerName.toString();
  const source = blobServiceClient.getContainerClient(containerName);
  const target = blobServiceClient.getContainerClient(
    `${containerName}-backup`
  );

  await target.createIfNotExists();

  for await (const blob of source.listBlobsFlat()) {
    const sourceBlob = source.getBlobClient(blob.name);
    const targetBlob = target.getBlobClient(blob.name);

    await targetBlob.beginCopyFromURL(sourceBlob.url);
  }

  console.log("Backup completed for", containerName);
};

const main = async (container, oldKey, newKey) => {
  container = container.toString();
  const containerClient = blobServiceClient.getContainerClient(container);
  const exists = await containerClient.exists();
  if (!exists) {
    console.log("Container does not exist. Skipping:", container);
    return;
  }

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

    if (hasBadformat) {
      console.log("Invalid file", blob.name);
    } else {
      const decryptedContent = decryptedChunks.join("");
      const content = encryptFile(decryptedContent, newKey);
      await overWriteFile(container, blob.name, content);
    }
  }

  console.log("done", container);
};

module.exports = {
  main,
  backupContainer,
};
