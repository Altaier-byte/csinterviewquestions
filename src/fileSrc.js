const path = require('path');
const { format } = require('util');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const postSrc = require('./postSrc');
const { logger } = require('./logger');
const { isHttpErrorCode } = require('./tools');
const db = require('../db/db');

// Configure upload to GCS
const gcsProjectId = process.env.GCS_PROJECT_ID;
const gcsFilePath = process.env.GCS_FILE_PATH;
const gcsBucket = process.env.GCS_BUCKET;

const storage = new Storage({ projectId: gcsProjectId, keyFilename: path.join(__dirname, gcsFilePath) });
const bucket = storage.bucket(gcsBucket);

// Configure upload to local server
const storageLocal = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/files/userUpload');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const uploadLocal = multer({
  storage: storageLocal,
  limits: {
    fileSize: 5 * 1024 * 1024, // no larger than 5mb
  },
  fileFilter: function (req, file, callback) {
    try {
      const ext = path.extname(file.originalname);
      if (ext !== '.png') throw { code: 400, message: 'Unsupported file type, only zip files are allowed' };
      logger.debug({ label: 'Filtered file - format okay' });
      callback(null, true);
    } catch (error) {
      if (error.code && isHttpErrorCode(error.code)) {
        logger.error(error);
        callback(error);
      }
      const userMsg = 'Could not filter file';
      logger.error({ userMsg, error });
      callback({ code: 500, message: userMsg });
    }
  }
}).single('file');

/**
 * @function uploadFile
 * @summary Upload a file to Google Cloud Storage
 * @param {object} req Http request
 * @param {string} folderName Folder name posts or comments
 * @returns {object} uploadFileResults
 * @throws {object} errorCodeAndMsg
 */
const uploadFile = function uploadFile(req, folderName) {
  if (folderName !== 'posts' && folderName !== 'comments') throw { code: 500, message: 'Folder must be posts or comments' };

  return new Promise((resolve, reject) => {
    if (!req.file) {
      logger.debug({ label: 'Upload file skipped', results: 'Empty file request' });
      resolve({ message: 'Empty file request' });
    }

    // Create a new blob in the bucket and upload the file data.
    const blob = bucket.file(`${folderName}/${req.file.originalname}`);
    const blobStream = blob.createWriteStream();

    blobStream.on('error', (blobStreamErr) => {
      logger.error({ label: 'Could not upload file', results: blobStreamErr });
      reject(new Error({ code: 500, message: 'Could not upload file' }));
    });

    blobStream.on('finish', () => {
      // The public URL can be used to directly access the file via HTTP.
      const publicUrl = format(
        `https://storage.googleapis.com/${bucket.name}/${blob.name}`
      );
      logger.debug({ message: 'Uploaded file successfully', results: publicUrl });
      resolve({ message: 'Uploaded file successfully', fileUrl: publicUrl });
    });

    blobStream.end(req.file.buffer);
  });
};

/**
 * @function uploadFile
 * @summary Upload a file to Google Cloud Storage
 * @param {object} req Http request
 * @param {string} folderName Folder name posts or comments
 * @returns {object} uploadFileResults
 * @throws {object} errorCodeAndMsg
 */
const uploadFileLocally = function uploadFileLocally(req, folderName) {
  if (folderName !== 'posts' && folderName !== 'comments') throw { code: 500, message: 'Folder must be posts or comments' };

  return new Promise((resolve, reject) => {
    // Upload file
    uploadLocal(req, null, function (err) {
      if (!req.file) {
        logger.debug({ label: 'Upload file skipped', results: 'Empty file request' });
        resolve({ message: 'Empty file request', req });
      }

      if (err) {
        logger.error({ label: 'Could not upload file', results: err });
        reject(new Error({ code: 500, message: 'Could not upload file' }));
      } else {
        const fileUrl = req.file.path.replace('public/', '/');

        logger.debug({ message: 'Uploaded file successfully', results: fileUrl });
        resolve({ message: 'Uploaded file successfully', fileUrl, req });
      }
    });
  });
};

/**
 * @function addDocumentFileUrl
 * @summary Add post/comment's file url
 * @param {number} documentId Post/comment's id
 * @param {string} fileUrl Post/comment's file url
 * @param {string} documentType Document type post vs comment
 * @returns {object} addFileUrlResults
 * @throws {boolean} false
 */
const addDocumentFileUrl = async function addDocumentFileUrl(documentId, fileUrl, documentType) {
  if (!documentId || !fileUrl || !documentType) throw { code: 400, message: 'Please provide a post/comment id, fileUrl, and a document type i.e. post or comment' };

  let tableName = null;
  let documentKeyName = null;
  if (documentType.toLocaleLowerCase() == 'post' || documentType.toLocaleLowerCase() == 'posts') {
    tableName = 'post_files';
    documentKeyName = 'post_id';
  } else if (documentType.toLocaleLowerCase() == 'comment' || documentType.toLocaleLowerCase() == 'comments') {
    tableName = 'comment_files';
    documentKeyName = 'comment_id';
  } else throw { code: 400, message: 'Unsupported file url document type' };

  const queryResults = await db.query(`insert into ${tableName}(${documentKeyName}, file_url) values($1, $2) returning id`, [documentId, fileUrl]);
  logger.debug({ label: `set a ${documentType}'s file url response`, results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function deleteDocumentFileUrlById
 * @summary Delete post/comment's file url by its id
 * @param {number} fileId File's id
 * @param {string} documentType Document type post vs comment
 * @param {object} user User's information
 * @returns {object} deleteFileResults
 * @throws {boolean} false
 */
const deleteDocumentFileUrlById = async function deleteDocumentFileUrlById(fileId, documentType, user) {
  try {
    // Check if there is no document id or document type
    if (!fileId || !documentType) throw { code: 400, message: 'Please provide file id, and document type' };

    let tableName = null;
    let documentKeyName = null;
    if (documentType == 'post') {
      tableName = 'post_files';
      documentKeyName = 'post_id';
    } else if (documentType == 'comment') {
      tableName = 'comment_files';
      documentKeyName = 'comment_id';
    } else throw { code: 400, message: 'Unsupported file url document type' };

    const queryResults = await db.query(`delete from ${tableName} where id=$1`, [fileId]);
    logger.debug({ label: `delete a ${documentType}'s file url response`, results: queryResults.rows });

    return { message: 'Deleted document file url by its id successfully' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not delete document file url by its id';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function deleteDocumentFileUrlByUrl
 * @summary Delete post/comment's file url by its url
 * @param {string} fileUrl File's url
 * @param {string} documentType Document type post vs comment
 * @param {object} user User's information
 * @returns {object} deleteFileResults
 * @throws {boolean} false
 */
const deleteDocumentFileUrlByUrl = async function deleteDocumentFileUrlByUrl(fileUrl, documentType, user) {
  try {
    // Check if there is no document id or document type
    if (!fileUrl || !documentType) throw { code: 400, message: 'Please provide file url, and document type' };

    let tableName = null;
    let documentKeyName = null;
    if (documentType == 'post') {
      tableName = 'post_files';
      documentKeyName = 'post_id';
    } else if (documentType == 'comment') {
      tableName = 'comment_files';
      documentKeyName = 'comment_id';
    } else throw { code: 400, message: 'Unsupported file url document type' };

    const queryResults = await db.query(`delete from ${tableName} where file_url=$1`, [fileUrl]);
    logger.debug({ label: `delete a ${documentType}'s file url response`, results: queryResults.rows });

    return { message: 'Deleted document file url by its url successfully' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not delete document file url by its url';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function deleteDocumentFileUrlByDocumentId
 * @summary Delete post/comment's file url by its post/comment id
 * @param {number} documentId Post/comment's id
 * @param {string} documentPin Document management pin
 * @param {string} documentType Document type post vs comment
 * @param {object} user User's information
 * @returns {object} deleteFileResults
 * @throws {boolean} false
 */
const deleteDocumentFileUrlByDocumentId = async function deleteDocumentFileUrlByDocumentId(documentId, documentPin, documentType, user) {
  try {
    // Check if there is no document id or document type
    if (!documentId || !documentType) throw { code: 400, message: 'Please provide document id, and document type' };

    // Verify document pin
    if (documentType == 'post') {
      const verifyPin = postSrc.verifyPostPin(documentId, documentPin);
      if (!verifyPin) throw { code: 401, message: 'Please check pin and post' };
    }

    // Build table name and key name
    let tableName = null;
    let documentKeyName = null;
    if (documentType == 'post') {
      tableName = 'post_files';
      documentKeyName = 'post_id';
    } else if (documentType == 'comment') {
      tableName = 'comment_files';
      documentKeyName = 'comment_id';
    } else throw { code: 400, message: 'Unsupported file url document type' };

    const queryResults = await db.query(`delete from ${tableName} where ${documentKeyName}=$1`, [documentId]);
    logger.debug({ label: `delete a ${documentType}'s file url response`, results: queryResults.rows });

    return { message: 'Deleted document file url by post/comment id successfully' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not delete document file url by post/comment id';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function getDocumentFileUrlByDocumentId
 * @summary Get post/comment's file url by its post/comment id
 * @param {number} documentId Post/comment's id
 * @param {string} documentType Document type post vs comment
 * @returns {object} getFileResults
 * @throws {boolean} false
 */
const getDocumentFileUrlByDocumentId = async function getDocumentFileUrlByDocumentId(documentId, documentType) {
  try {
    // Check if there is no document id or document type
    if (!documentId || !documentType) throw { code: 400, message: 'Please provide document id, and document type' };

    let tableName = null;
    let documentKeyName = null;
    if (documentType == 'post') {
      tableName = 'post_files';
      documentKeyName = 'post_id';
    } else if (documentType == 'comment') {
      tableName = 'comment_files';
      documentKeyName = 'comment_id';
    } else throw { code: 400, message: 'Unsupported file url document type' };

    const queryResults = await db.query(`select * from ${tableName} where ${documentKeyName}=$1`, [documentId]);
    logger.debug({ label: `Get a ${documentType}'s file url response`, results: queryResults.rows });

    return queryResults.rows;
  } catch (error) {
    const userMsg = 'Could not get document file url by post/comment id';
    logger.error({ userMsg, error });
    return false;
  }
};

module.exports = {
  uploadFile,
  uploadFileLocally,
  addDocumentFileUrl,
  deleteDocumentFileUrlById,
  deleteDocumentFileUrlByUrl,
  deleteDocumentFileUrlByDocumentId,
  getDocumentFileUrlByDocumentId
};
