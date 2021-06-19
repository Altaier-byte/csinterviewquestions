const express = require('express');
const router = express.Router();
const { logger } = require('../src/logger');
const authorizationSrc = require('../src/authorizationSrc');
const commentSrc = require('../src/commentSrc');

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
    const data = await commentSrc[functionName].apply(this, [...parameters, user]);
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
 * @summary Create a comment
 */
router.post('/comments', async (req, res) => {
  const {
    postId,
    body,
    solution
  } = req.body;
  callSrcFile('newComment', [postId, body, solution], req, res);
});

/**
 * @summary Get a comment
 */
router.get('/comments/:commentId', async (req, res) => {
  const { commentId } = req.params;
  callSrcFile('getCommentExternal', [commentId], req, res, true);
});

/**
 * @summary Delete a comment
 */
router.delete('/comments', async (req, res) => {
  const {
    commentId
  } = req.body;
  callSrcFile('deleteComment', [commentId], req, res);
});

/**
 * @summary Update a comment
 */
router.put('/comments', async (req, res) => {
  const {
    commentId,
    body,
    solution
  } = req.body;
  callSrcFile('modifyPost', [commentId, body, solution], req, res);
});

/**
 * @summary Get all post's comment
 */
router.post('/comments/post', async (req, res) => {
  const { postId, sortOrder, limit, offset } = req.body;
  callSrcFile('getAllPostCommentsExternal', [postId, sortOrder, limit, offset], req, res, true);
});

/**
 * @summary Get all post's comment solutions
 */
router.post('/comments/post/solutions', async (req, res) => {
  const { postId, sortOrder, limit, offset } = req.body;
  callSrcFile('getAllPostSolutionsExternal', [postId, sortOrder, limit, offset], req, res, true);
});

module.exports = router;
