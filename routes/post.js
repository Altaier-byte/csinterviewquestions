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
const callSrcFile = async function callSrc(functionName, parameters, req, res, skipVerify = false) {
  let userCheckPass = false;
  try {
    let user = {};
    if (!skipVerify) {
      user = await authorizationSrc.verifyToken(req);
    }
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
  callSrcFile('getPostExternal', [postId], req, res, true);
});

/**
 * @summary Delete a post
 */
router.post('/deletePost/:postId', async (req, res) => {
  const { postPin } = req.body;
  const { postId } = req.params;
  callSrcFile('deletePost', [postId, postPin], req, res, true);
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

/**
 * @summary Get all posts
 */
router.post('/posts/all', async (req, res) => {
  const { sortKey, sortOrder, limit, offset } = req.body;
  callSrcFile('getAllPostsExternal', [sortKey, sortOrder, limit, offset], req, res, true);
});

/**
 * @summary Get all company posts
 */
router.post('/posts/company', async (req, res) => {
  const { sortKey, sortOrder, limit, offset, company } = req.body;
  callSrcFile('getAllCompanyPostsExternal', [sortKey, sortOrder, limit, offset, company], req, res, true);
});

/**
 * @summary Get all position posts
 */
router.post('/posts/position', async (req, res) => {
  const { sortKey, sortOrder, limit, offset, position } = req.body;
  callSrcFile('getAllPositionPostsExternal', [sortKey, sortOrder, limit, offset, position], req, res, true);
});

/**
 * @summary Get all position posts for a company
 */
router.post('/posts/position/company', async (req, res) => {
  const { sortKey, sortOrder, limit, offset, position, company } = req.body;
  callSrcFile('getAllPositionCompanyPostsExternal', [sortKey, sortOrder, limit, offset, position, company], req, res, true);
});

/**
 * @summary Get all companies
 */
router.get('/companies', async (req, res) => {
  callSrcFile('getCompaniesExternal', [], req, res, true);
});

/**
 * @summary Get all positions
 */
router.get('/positions', async (req, res) => {
  callSrcFile('getPositionsExternal', [], req, res, true);
});

module.exports = router;
