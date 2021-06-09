const jwt = require('jsonwebtoken');
const moment = require('moment');
const bcrypt = require('bcrypt');
const randomString = require('randomstring');
const { logger } = require('./logger');
const { isHttpErrorCode, sendEmailText } = require('./tools');
const db = require('../db/db');

// /**
//  * @function addUserIP
//  * @summary Register a new user in the system
//  * @param {*} req http request contains user information
//  * @returns {object} addUserIPResults
//  * @throws {object} errorCodeAndMsg
//  */
// const addUserIP = async function addUserIP(req) {
//   try {
//     const {
//       email,
//       ip
//     } = req.body;

//     // Check if there is no email or password
//     if (!email || !ip) {
//       throw { code: 400, message: 'Please provide required information' };
//     }

//     // Add ip to user in the database
//     const updateIPQuery = await db.query('update users set ip = array_append(ip, $1) where email=$2 returning email', [ip, email]);
//     logger.debug({ label: 'registration query response', results: updateIPQuery.rows });

//     return { message: 'User ip added successfully', email: updateIPQuery.rows[0].email };
//   } catch (error) {
//     if (error.code && isHttpErrorCode(error.code)) {
//       logger.error(error);
//       throw error;
//     }
//     const userMsg = 'Could not add ip to user';
//     logger.error({ userMsg, error });
//     throw { code: 500, message: userMsg };
//   }
// };

/**
 * @function getUser
 * @summary Get user from database
 * @param {string} email User's email
 * @returns {object} getUserResults
 * @throws {boolean} false
 */
const getUser = async function getUser(email) {
  // Check if there is no email
  if (!email) throw { code: 400, message: 'Please provide an email' };

  const queryResults = await db.query('select email, banned, pin from users where email=$1', [email]);
  logger.debug({ label: 'get user query response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function registerUser
 * @summary Register a new user in the database
 * @param {string} email User's email
 * @param {string} ip User's ip address
 * @returns {object} registerUserResults
 * @throws {boolean} false
 */
const registerUser = async function registerUser(email, ip) {
  // Check if there is no email or ip
  if (!email || !ip) throw { code: 400, message: 'Please provide required registration information' };

  // Create a user in the database
  const queryResults = await db.query('insert into users(email, ip) VALUES($1, $2) returning email', [email, '{' + ip + '}']);
  logger.debug({ label: 'registration query response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function updateUserPin
 * @summary Update user's pin
 * @param {string} email User's email
 * @param {string} pin User's pin
 * @returns {object} updateUserPinResults
 * @throws {boolean} false
 */
const updateUserPin = async function updateUserPin(email, pin) {
  // Check if there is no email or pin
  if (!email || !pin) throw { code: 400, message: 'Please provide required an email and pin' };

  // Update user's pin in the database
  const queryResults = await db.query('update users set pin=$1 where email=$2 returning email', [pin, email]);
  logger.debug({ label: 'Update user pin response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function generateUserPin
 * @summary Generate a new user pin and call send an email
 * @param {*} req http request contains user information
 * @returns {object} generateUserPinResults
 * @throws {object} errorCodeAndMsg
 */
const generateUserPin = async function generateUserPin(req) {
  try {
    const {
      email,
      ip
    } = req.body;

    // Check if there is no email or ip
    if (!email || !ip) throw { code: 400, message: 'Please provide required information' };

    // Get user from database
    const dbUser = await getUser(email);

    // If there is no user then inser it
    if (!dbUser) {
      const newUser = await registerUser(email, ip);
      if (!newUser) throw { code: 500, message: 'Could not register user' };
    }

    // Generate a random pin
    const newPin = randomString.generate(12);

    // Update pin in the database
    const updatePin = await updateUserPin(email, newPin);
    if (!updatePin) throw { code: 500, message: 'Could not generate a pin' };

    // Send email with the pin
    const subject = 'Your PIN Verification is Here';
    const body = `PIN: ${newPin}`;

    const sendEmailResults = await sendEmailText(email, subject, body);

    if (sendEmailResults && sendEmailResults.messageId) {
      return { message: 'Email sent successfully' };
    } else {
      throw { code: 500, message: 'Could not send email' };
    }
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not generate user pin';
    logger.error({ userMsg, error });
    logger.error(error.message);
    throw { code: 500, message: userMsg };
  }
};

module.exports = {
  generateUserPin
};
