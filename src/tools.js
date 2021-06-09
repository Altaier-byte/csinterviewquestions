const nodemailer = require('nodemailer');
const { logger } = require('./logger');
const db = require('../db/db');

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

module.exports = {
  checkUserProjectPermission,
  checkUserInProject,
  titleCase,
  isHttpErrorCode,
  sendEmailText
};
