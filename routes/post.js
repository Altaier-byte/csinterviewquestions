const express = require('express');
const router = express.Router();
const { logger } = require('../src/logger');
const authorizationSrc = require('../src/authorizationSrc');
const postSrc = require('../src/postSrc');

/**
 * Custom function to call src file
 * @param {string} srcFunctionName source file function name
 * @param {array} parameters Variables to send with the function
 * @returns {object} response
 */
const callSrcFile = async function callSrc(functionName, parameters, req, res) {
  let userCheckPass = false;
  try {
    const user = await authorizationSrc.verifyToken(req);
    userCheckPass = true;
    const data = await postSrc[functionName].apply(this, [...parameters, user]);
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
 * @summary Create a post
 */
router.post('/posts', async (req, res) => {
  const {
    title,
    interviewDate,
    company,
    position,
    body
  } = req.body;
  callSrcFile('newPost', [title, interviewDate, company, position, body], req, res);
});

/**
 * @summary Get a post
 */
router.get('/posts/:postId', async (req, res) => {
  const { postId } = req.params;
  callSrcFile('getPostExternal', [postId], req, res);
});

/**
 * @summary Delete a post
 */
router.delete('/posts', async (req, res) => {
  const {
    postId,
    postPin
  } = req.body;
  callSrcFile('deletePost', [postId, postPin], req, res);
});

/**
 * @summary Update a post
 */
router.put('/posts', async (req, res) => {
  const {
    postId,
    postPin,
    title,
    interviewDate,
    company,
    position,
    body
  } = req.body;
  callSrcFile('modifyPost', [postId, postPin, title, interviewDate, company, position, body], req, res);
});

module.exports = router;
