const { BlobServiceClient } = require("@azure/storage-blob");
const { storageAccount, storageAccessKey } = require("./config");
const fs = require("fs");
let CryptoJS = require("crypto-js");

const blobServiceClient = BlobServiceClient.fromConnectionString(
  `DefaultEndpointsProtocol=https;AccountName=${storageAccount};AccountKey=${storageAccessKey};EndpointSuffix=core.windows.net`
);
let containerIds = JSON.parse(fs.readFileSync("./noteIds.json"));
const chunkSize = 10 * 1024 * 1024;
const chunkSeparator = "###"; // Unique separator
const bytesInMb = 1048576;
const listFilesInContainer = async (containerName) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    let i = 1;
    for await (const blob of containerClient.listBlobsFlat()) {
      listOfBlobs.push({
        containerName,
        blobName: blob.name,
      });
    }
  } catch (error) {}
};

let listOfBlobs = [];
containerIds.forEach((containerId) => {
  listFilesInContainer(containerId);
});
setTimeout(() => {
  console.log(listOfBlobs.length);

  listOfBlobs.forEach(async (blob) => {
    let content = await readFile(blob.containerName, blob.blobName);
    if (content === "badformat") {
      console.log("badformat", blob.containerName, blob.blobName);
      return;
    }
    content = encryptFile(content);
    await overWriteFile(blob.containerName, blob.blobName, content);
  });
}, 2000);

readFile = async (containerName, blobName) => {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const downloadBlockBlobResponse = await blockBlobClient.downloadToBuffer();
  const encryptedContent = downloadBlockBlobResponse.toString();
  const encryptedChunks = encryptedContent.split(chunkSeparator);
  const decryptedChunks = [];

  for (const encChunk of encryptedChunks) {
    const decChunk = decryptionAES(encChunk, "1234567");
    if (decChunk === "badformat") {
      return "badformat";
    }
    decryptedChunks.push(decChunk);
  }
  const decryptedContent = decryptedChunks.join("");
  return decryptedContent;
};

overWriteFile = async (containerName, blobName, content) => {
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

encryptFile = (fileDataUrl) => {
  const encryptedChunks = [];
  const totalChunks = Math.ceil(fileDataUrl.length / chunkSize);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = start + chunkSize;
    const chunk = fileDataUrl.substring(start, end);

    const encChunk = encryptionAES(chunk, "1234567");
    encryptedChunks.push(encChunk);
  }

  const joinedEncryptedData = encryptedChunks.join(chunkSeparator);
  return joinedEncryptedData;
};
