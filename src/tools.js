const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const { logger } = require('./logger');
const db = require('../db/db');

/**
 * @function isHttpErrorCode
 * @summary Convert a string to title case format
 * @params {string} inputString Input string
 * @returns {boolean} httpErroCodeResults
 */
const isHttpErrorCode = function isHttpErrorCode(errorCode) {
  try {
    const errorCodes = [400, 401, 402, 403, 404, 500];
    return errorCodes.some((item) => {
      return item === errorCode;
    });
  } catch (error) {
    return false;
  }
};

// Multer configruations to parse request and upload file in memory
const upload = multer({
  storage: multer.memoryStorage(),
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
 * @async
 * @function checkUserProjectPermission
 * @summary Check if user has permissions to modify a project
 * @param {number} userId User Id
 * @param {number} projectId Project Id
 * @returns {object} results
 * @throws {object} errorDetails
 */
const checkUserProjectPermission = async function checkUserProjectPermission(userId, projectId) {
  try {
    const userProjectPermissionQuery = await db.query('select project_id from projects_users where user_id=$1', [userId]);
    logger.debug({ label: 'user project permission query response', results: userProjectPermissionQuery.rows });

    if (!userProjectPermissionQuery || !userProjectPermissionQuery.rows || !userProjectPermissionQuery.rows[0] || !userProjectPermissionQuery.rows[0].project_id || !userProjectPermissionQuery['rows'][0]['project_id'].includes(projectId)) {
      throw { code: 403, message: 'User does not have requests permissions on selected project.' };
    } else {
      return { allowed: true };
    }
  } catch (error) {
    throw { code: 403, message: 'User does not have requests permissions on selected project.' };
  }
};

/**
 * @async
 * @function checkUserInProject
 * @summary Check if a user in a project
 * @param {number} userId User Id
 * @param {number} projectId Project Id
 * @returns {object} results
 * @throws {object} errorDetails
 */
const checkUserInProject = async function checkUserInProject(userId, projectId) {
  try {
    const userProjectQuery = await db.query('select project_id from projects_users where user_id=$1 and project_id=$2', [userId, projectId]);
    const projectAdminQuery = await db.query('select user_id from projects where user_id=$1', [userId]);
    logger.debug({ label: 'user in project query response', userProjectResults: userProjectQuery.rows, projectAdminResults: projectAdminQuery.rows });

    let userProjectCheck = true;
    let projectAdminCheck = true;

    if (!userProjectQuery || !userProjectQuery.rows || !userProjectQuery.rows[0]) {
      userProjectCheck = false;
    }

    if (!projectAdminQuery || !projectAdminQuery.rows || !projectAdminQuery.rows[0]) {
      projectAdminCheck = false;
    }

    if (userProjectCheck || projectAdminCheck) {
      return { allowed: true };
    } else {
      throw { code: 403, message: 'User is not in the project' };
    }
  } catch (error) {
    console.log(error);
    throw { code: 403, message: 'User is not in the project' };
  }
};

/**
 * @function titleCase
 * @summary Convert a string to title case format
 * @params {string} inputString Input string
 * @returns {string} titleCaseString
 */
const titleCase = function titleCase(inputString) {
  try {
    return inputString.toLowerCase().split(' ').map(function (word) {
      return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
  } catch (error) {
    return inputString;
  }
};

/**
 * @function sendEmailText
 * @summary Send a text email
 * @params {string} emailTo
 * @params {string} subject
 * @params {string} textBody
 * @returns {object} sendEmailResults
 * @throws {object} sendEmailErroCodeResults
 */
const sendEmailText = async function sendEmailText(emailTo, subject, body) {
  // Set default log level for file and console transports
  const emailUsername = process.env.EMAILUSERNAME || 'error';
  const emailPassword = process.env.EMAILPASSWORD || 'debug';

  try {
    const emailAccount = {
      'user': emailUsername,
      'pass': emailPassword
    };

    const transporter = nodemailer.createTransport({
      name: 'aalzubidy.com',
      host: 'server204.web-hosting.com',
      port: 465,
      secure: true,
      auth: {
        user: emailAccount.user,
        pass: emailAccount.pass,
      },
      logger: false
    });

    const info = await transporter.sendMail({
      from: '"CS Interview Questions" <' + emailAccount.user + '>',
      to: emailTo,
      subject,
      text: body
    });

    logger.debug({ label: 'Email sent', emailFrom: emailAccount.user, emailTo: emailTo, messageId: info.messageId });

    return { message: 'Email sent', emailFrom: emailAccount.user, emailTo: emailTo, messageId: info.messageId };
  } catch (error) {
    logger.error(error);
    if (error.code && isHttpErrorCode(error.code)) throw error;
    throw { code: 500, message: 'Could not send email' };
  }
};

/**
 * @function parseFormDataWithFile
 * @summary Parse form data from http request
 * @param {object} req Http request
 * @returns {object} reqParsed
 * @throws {object} errorDetails
 */
const parseFormDataWithFile = function parseFormDataWithFile(req) {
  return new Promise((resolve, reject) => {
    upload(req, {}, (err) => {
      if (err) reject(err);
      resolve(req);
    });
  });
};

module.exports = {
  parseFormDataWithFile,
  checkUserProjectPermission,
  checkUserInProject,
  titleCase,
  isHttpErrorCode,
  sendEmailText
};
