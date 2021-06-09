const jwt = require('jsonwebtoken');
const { logger } = require('./logger');
const { isHttpErrorCode, sendEmailText } = require('./tools');
const db = require('../db/db');

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
const pinTokenSecret = process.env.PIN_TOKEN_SECRET;

/**
 * @function addUserIP
 * @summary Add an ip to user ip addresses
 * @param {string} email User's email
 * @param {string} ip User's ip address
 * @returns {object} addUserIPResults
 * @throws {boolean} false
 */
const addUserIP = async function addUserIP(email, ip) {
  // Check if there is no email or password
  if (!email || !ip) throw { code: 400, message: 'Please provide required information' };

  // Add ip to user in the database
  const queryResults = await db.query('update users set ip = array_append(ip, $1) where email=$2 returning email', [ip, email]);
  logger.debug({ label: 'update user ip response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

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
  const queryResults = await db.query('insert into users(email, ip, pin) VALUES($1, $2, $3) returning email', [email, '{' + ip + '}', 'null']);
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

    // Generate a 5 minutes JWT pin
    const newPin = await jwt.sign({ email }, pinTokenSecret, { expiresIn: '10m' });

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

/**
 * @function login
 * @summary Login to the system
 * @param {*} req http request contains email, pin, and ip
 * @returns {object} credientials Access Token and Refresh Token
 * @throws {object} errorCodeAndMsg
 */
const login = async function login(req) {
  try {
    // Extract email and pin
    const { email, pin, ip } = req.body;

    // Check if there is no email or pin
    if (!email || !pin || !ip) throw { code: 400, message: 'Please provide email and pin' };

    // Validate PIN and JWT
    const pinResults = await jwt.verify(pin, pinTokenSecret);

    // Get user information from database and check if it matches
    const userDb = await getUser(email);

    if (userDb && userDb.email == email && userDb.pin == pin && pin !== 'null' && userDb.pin !== 'null' && pinResults.email == email) {
      // Generate access token and refresh token
      const user = { email: email };

      const accessToken = await jwt.sign(user, accessTokenSecret, { expiresIn: '30m' });
      const refreshToken = await jwt.sign(user, refreshTokenSecret);

      // Update the database with the new refresh token
      await db.query('update users set refresh_token=$1 where email=$2', [refreshToken, email]);

      // Update user ip
      await addUserIP(email, ip);

      // Update user pin
      await updateUserPin(email, 'null');

      // Return the access token and the refresh token
      return ({ accessToken, refreshToken });
    } else throw { code: 401, message: 'Please check email and pin' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const errorMsg = 'Could not login';
    logger.error({ errorMsg, error });
    throw { code: 500, message: errorMsg };
  }
};

/**
 * @function logout
 * @summary Logout of the system to the system
 * @param {*} req http request contains access token and refresh token
 * @returns {object} logoutMsg
 * @throws {object} errorCodeAndMsg
 */
const logout = async function logout(req) {
  try {
    // Extract token and refresh token
    const { token } = req.headers;
    const refreshToken = req.cookies['refresh_token'];

    if (!token || !refreshToken) throw { code: 400, message: 'Please provide token and refresh token' };

    // Verify both tokens
    const tokenVerify = await jwt.verify(token, accessTokenSecret);
    const refreshTokenVerify = await jwt.verify(refreshToken, refreshTokenSecret);

    if (tokenVerify.id != refreshTokenVerify.id) throw { code: 401, message: 'Please provide valid token and refresh token' };

    // Delete refresh token from database
    const dbResults = await db.query('update users set refresh_token=$1 where refresh_token=$2', ['null', refreshToken]);

    if (dbResults) {
      return ({ 'results': 'Logged out successful' });
    } else {
      throw { code: 500, message: 'Could not delete token' };
    }
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const errorMsg = 'Could not logout';
    logger.error({ errorMsg, error });
    throw { code: 500, message: errorMsg };
  }
};

/**
 * @function renewToken
 * @summary Get new token from refresh token
 * @param {*} req http request contains access token and refresh token
 * @returns {object} credentials new access token and new refresh token
 * @throws {object} errorCodeAndMsg
 */
const renewToken = async function renewToken(req) {
  try {
    // Extract token and refresh token
    const { token } = req.headers;
    const { refreshToken } = req.body;

    if (!token || !refreshToken) throw { code: 400, message: 'Please provide token and refresh token' };

    // Verify both tokens
    const tokenVerify = await jwt.verify(token, accessTokenSecret);
    const refreshTokenVerify = await jwt.verify(refreshToken, refreshTokenSecret);

    // Check the email on both of the tokens
    if (tokenVerify.email === refreshTokenVerify.email) {
      // Check if this refresh token still active in the database
      const queryResults = await db.query('select email, refresh_token from users where refresh_token=$1 and email=$2', [refreshToken, tokenVerify.email]);
      if (queryResults && queryResults.rows[0] && (queryResults.rows[0].email === tokenVerify.email)) {
        // Generate a new access token
        const user = { email: queryResults.rows[0].email };
        const newAccessToken = await jwt.sign(user, accessTokenSecret, { expiresIn: '30m' });

        // Generate a new refresh token
        const newRefreshToken = await jwt.sign(user, refreshTokenSecret);
        // Update the database with the new refresh token
        await db.query('update users set refresh_token=$1 where email=$2', [newRefreshToken, user.email]);

        // Return new access token and same refresh token
        return ({ 'accessToken': newAccessToken, 'refreshToken': newRefreshToken });
      } else {
        const dbMsg = 'Could not query and verify user';
        logger.error({ dbMsg, queryResults });
        throw { code: 401, message: dbMsg };
      }
    } else {
      throw { code: 401, message: 'Could not verify tokens' };
    }
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const errorMsg = 'Could not generate a new token from existing refresh token';
    logger.error({ errorMsg, error });
    throw { code: 500, message: errorMsg };
  }
};

/**
 * @function renewTokenByCookie
 * @summary Get new token from refresh token cookie
 * @param {*} req http request contains access token and refresh token
 * @returns {object} credentials new access token and new refresh token
 * @throws {object} errorCodeAndMsg
 */
const renewTokenByCookie = async function renewTokenByCookie(req) {
  try {
    // Extract refresh token from cookie
    const refreshToken = req.cookies['refresh_token'];

    if (!refreshToken) throw { code: 400, message: 'Please provide a refresh token' };

    // Verify refresh token
    const refreshTokenVerify = await jwt.verify(refreshToken, refreshTokenSecret);

    // Check if this refresh token still active in the database
    const queryResults = await db.query('select email, refresh_token from users where refresh_token=$1 and email=$2', [refreshToken, refreshTokenVerify.email]);

    if (queryResults && queryResults.rows[0] && queryResults.rows[0]['refresh_token'] === refreshToken) {
      const user = { email: queryResults.rows[0].email };

      // Generate a new access token
      const newAccessToken = await jwt.sign(user, accessTokenSecret, { expiresIn: '30m' });

      // Generate a new refresh token
      const newRefreshToken = await jwt.sign(user, refreshTokenSecret);

      // Update the database with the new refresh token
      await db.query('update users set refresh_token=$1 where email=$2', [newRefreshToken, user.email]);

      // Return new access token and same refresh token
      return ({ 'accessToken': newAccessToken, 'refreshToken': newRefreshToken });
    } else {
      const dbMsg = 'Could not verify user token';
      logger.error({ dbMsg, queryResults });
      throw { code: 401, message: dbMsg };
    }
  } catch (error) {
    console.log(error);
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const errorMsg = 'Could not generate a new token from existing refresh token';
    logger.error({ errorMsg, error });
    throw { code: 500, message: errorMsg };
  }
};

/**
 * @function verifyToken
 * @summary Verify token and return user information
 * @param {object} req http request contains access token
 * @returns {object} user information from token
 * @throws {string} errorMsg
 */
const verifyToken = async function verifyToken(req) {
  try {
    const { token } = req.headers;

    if (!token) {
      throw { code: 400, messages: 'Token required' };
    }

    const results = await jwt.verify(token, accessTokenSecret);

    if (!results) {
      throw { code: 401, messages: 'Access denied' };
    }

    return (results);
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const errorMsg = 'Could not verify token';
    logger.error({ errorMsg, error });
    throw { code: 500, message: errorMsg };
  }
};

module.exports = {
  generateUserPin,
  login,
  logout,
  renewToken,
  renewTokenByCookie,
  verifyToken
};
