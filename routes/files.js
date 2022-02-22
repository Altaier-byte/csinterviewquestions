const express = require('express');
const router = express.Router();
const { logger } = require('../src/logger');
const authorizationSrc = require('../src/authorizationSrc');
const fileSrc = require('../src/fileSrc');
const postSrc = require('../src/postSrc');

/**
 * Custom function to call src file
 * @param {string} srcFunctionName source file function name
 * @param {array} parameters Variables to send with the function
 * @returns {object} response
 */
const callSrcFile = async function callSrc(functionName, parameters, req, res, skipVerify = false) {
  let userCheckPass = false;
  try {
    let user = {};
    if (!skipVerify) {
      user = await authorizationSrc.verifyToken(req);
    }
    userCheckPass = true;
    const data = await fileSrc[functionName].apply(this, [...parameters, user]);
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
 * @summary Get files urls by a post id
 */
router.get('/files/post/:postId', async (req, res) => {
  const { postId } = req.params;
  callSrcFile('getDocumentFileUrlByDocumentId', [postId, 'post'], req, res, true);
});

/**
 * @summary delete files by a post id
 */
router.delete('/files/post/:postId', async (req, res) => {
  const { postId } = req.params;
  const { postPin } = req.body;

  // Verify post pin
  const verifyResults = await postSrc.verifyPostPin(postId, postPin);
  if (!verifyResults) {
    res.status(401).json({
      error: {
        code: 401,
        message: 'Pin and did not match'
      }
    });
  } else {
    callSrcFile('deleteDocumentFilesByDocumentId', [postId, 'post'], req, res, true);
  }
});

module.exports = router;
