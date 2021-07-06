const Multer = require('multer');
const path = require('path');
const { format } = require('util');
const { Storage } = require('@google-cloud/storage');
const { logger } = require('./logger');
const { isHttpErrorCode } = require('./tools');

const gcsProjectId = process.env.GCS_PROJECT_ID;
const gcsFilePath = process.env.GCS_FILE_PATH;
const gcsBucket = process.env.GCS_BUCKET;

const storage = new Storage({ projectId: gcsProjectId, keyFilename: path.join(__dirname, gcsFilePath) });

const upload = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // no larger than 5mb
  },
  fileFilter: function (file, callback) {
    const ext = path.extname(file.originalname);
    if (ext !== '.zip') {
      return callback(new Error('Only text zip are allowed'));
    }
    callback(null, true);
  }
}).single('file');

const bucket = storage.bucket(gcsBucket);

/**
 * @function uploadFile
 * @summary Upload a file to Google Cloud Storage
 * @param {object} req Http request
 * @param {string} folderName Folder name posts or comments
 * @returns {object} uploadFileResults
 * @throws {object} errorCodeAndMsg
 */
const uploadFile = function uploadFile(req, folderName) {
  try {
    if (folderName !== 'posts' || folderName !== 'comments') throw { code: 500, message: 'Folder must be posts or comments' };

    upload(req, {}, (err) => {
      if (err) throw { code: 500, message: 'Could not store file temporarily' };

      if (!req.file) return { message: 'Empty file request' };

      // Create a new blob in the bucket and upload the file data.
      const blob = bucket.file(`${folderName}/${req.file.originalname}`);
      const blobStream = blob.createWriteStream();

      blobStream.on('error', (blobStreamErr) => {
        throw { code: 500, message: 'Could not upload file' };
      });

      blobStream.on('finish', () => {
        // The public URL can be used to directly access the file via HTTP.
        const publicUrl = format(
          `https://storage.googleapis.com/${bucket.name}/${blob.name}`
        );
        logger.debug({ message: 'Uploaded file successfully', results: publicUrl });
        return { message: 'Uploaded file successfully', fileUrl: publicUrl };
      });

      blobStream.end(req.file.buffer);
    });
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not store and upload file';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

module.exports = {
  uploadFile
};
