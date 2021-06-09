const express = require('express');
const router = express.Router();
const { logger } = require('../src/logger');
const authorizationSrc = require('../src/usersSrc');

/**
 * Custom function to call src file
 * @param {string} srcFunctionName source file function name
 * @param {array} parameters Variables to send with the function
 * @returns {object} response
 */
const callSrcFile = async function callSrc(functionName, parameters, req, res, skipVerify = true) {
  let userCheckPass = false;
  let user = {};
  try {
    if (!skipVerify) {
      user = await authorizationSrc.verifyToken(req);
    }
    userCheckPass = true;
    const data = await authorizationSrc[functionName].apply(this, [...parameters, user]);
    if (data.refreshToken) {
      res.cookie('refresh_token', data.refreshToken, {
        maxAge: 120 * 60 * 1000,
        httpOnly: true,
        secure: false
      });
    }
    res.status(200).json({
      data
    });
  } catch (error) {
    logger.error(error);
    if (error && error.code) {
      res.status(error.code).json({
        error
      });
    } else if (error && !userCheckPass) {
      res.status(401).json({
        error: {
          code: 401,
          message: 'Not authorized'
        }
      });
    } else {
      res.status(500).json({
        error: {
          code: 500,
          message: `Could not process ${req.originalUrl} request`
        }
      });
    }
  }
};

/**
 * @summary Register new users
 */
router.post('/register', async (req, res) => {
  callSrcFile('generateUserPin', [req], req, res);
});

module.exports = router;
