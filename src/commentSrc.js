const moment = require('moment');
const Filter = require('bad-words');
const randomstring = require('randomstring');
const bcrypt = require('bcrypt');
const filter = new Filter();
const { logger } = require('./logger');
const db = require('../db/db');
const { isHttpErrorCode } = require('./tools');

/**
 * @function newComment
 * @summary Create a new comment
 * @param {number} postId Post's id
 * @param {string} body Comment's body
 * @param {boolean} solution Indicate if it's a solution or not
 * @param {object} user User information
 * @returns {object} newCommentResults
 * @throws {object} errorCodeAndMsg
 */
const newComment = async function newComment(postId, body, solution, user) {
  try {
    if (!postId || !body || (solution !== true && solution !== false)) throw { code: 400, message: 'Please provide post id, body, and solution.' };

    body = filter.clean(body);

    // Get date
    const createDate = moment().format('MM/DD/YYYY');

    // Create a new post in the databsae
    const commentQuery = await db.query('insert into comments(post_id, body, solution, status, username, create_date) VALUES($1, $2, $3, $4, $5, $6) returning id', [postId, body, solution, 'published', user.username, createDate]);
    logger.debug({ label: 'create new comment query response', results: commentQuery.rows });

    if (commentQuery && commentQuery.rows.length > 0) {
      return { message: 'Comment have been published successfully', id: commentQuery.rows[0].id };
    } else {
      throw { code: 500, message: 'Could not publish comment' };
    }
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not create comment';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function setCommentStatus
 * @summary Set a comment's status in database
 * @param {number} commentId Comment's id
 * @param {string} status comment's status
 * @returns {object} setCommentResults
 * @throws {boolean} false
 */
const setCommentStatus = async function setCommentStatus(commentId, status) {
  if (!commentId || !status) throw { code: 400, message: 'Please provide a comment id and status' };

  const queryResults = await db.query('update comments set status=$1 where id=$2 returning id', [status, commentId]);
  logger.debug({ label: 'set a comment\'s status response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function getComment
 * @summary Get a comment from database
 * @param {number} commentId Comment's id
 * @returns {object} getCommentResults
 * @throws {boolean} false
 */
const getComment = async function getComment(commentId) {
  if (!commentId) throw { code: 400, message: 'Please provide a comment id' };

  const queryResults = await db.query('select * from comments where id=$1', [commentId]);
  logger.debug({ label: 'get a comment query response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function getCommentExternal
 * @summary Get a comment from database
 * @param {number} commentId Comment's id
 * @param {object} user User information
 * @returns {object} getCommentResults
 * @throws {object} errorCodeAndMsg
 */
const getCommentExternal = async function getCommentExternal(commentId, user) {
  try {
    if (!commentId) throw { code: 400, message: 'Please provide a comment id' };

    const queryResults = await db.query('select id, post_id, body, solution, create_date, username from comments where id=$1', [commentId]);
    logger.debug({ label: 'get a comment query response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
    else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get a comment';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function deleteComment
 * @summary Delete a comment
 * @param {number} commentId Comment's id
 * @param {object} user User information
 * @returns {object} commentDeleteResults
 * @throws {object} errorCodeAndMsg
 */
const deleteComment = async function deleteComment(commentId, user) {
  try {
    if (!commentId && commentId != 0) throw { code: 400, message: 'Please provide a comment id' };

    // Get comment
    const commentDb = await getComment(commentId);
    if (!commentDb) throw { code: 404, message: 'Could not find requested comment' };

    // Compare comment username to username
    if (commentDb.username !== user.username) throw { code: 403, message: 'User does not have permissions to delete this comment' };

    // Delete comment
    const setCommentDb = await setCommentStatus(commentId, 'deleted');
    if (!setCommentDb) throw { code: 500, message: 'Could not delete comment' };

    return { 'message': 'Deleted comment successfully' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not delete comment';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function modifyComment
 * @summary Modify a comment
 * @param {number} commentId Comment's id
 * @param {boolean} solution Indicate if it's a solution or not
 * @param {string} body Body
 * @param {object} user User information
 * @returns {object} newCommentResults
 * @throws {object} errorCodeAndMsg
 */
const modifyComment = async function modifyComment(commentId, body, solution, user) {
  try {
    if (!commentId) throw { code: 400, message: 'Please provide a comment id' };

    // Get comment
    const commentDb = await getComment(commentId);
    if (!commentDb) throw { code: 404, message: 'Could not find requested comment' };

    // Compare comment username to username
    if (commentDb.username !== user.username) throw { code: 403, message: 'User does not have permissions to modify this comment' };

    // Clean language
    body = body ? filter.clean(body) : body;

    // Update comment
    let count = 1;
    let updateString = 'update comments set(';
    const updateArray = [];

    if (body) updateString = `${updateString} body `;
    if (solution || solution === false) updateString = `${updateString}, solution `;

    updateString = `${updateString})=(`;

    if (body) {
      updateString = `${updateString} $${count}`;
      count += 1;
      updateArray.push(body);
    }
    if (solution || solution === false) {
      updateString = `${updateString}, $${count}`;
      count += 1;
      updateArray.push(solution);
    }

    updateString = `${updateString}) where id=$${count} returning id`;
    updateArray.push(commentId);

    const updateQuery = await db.query(updateString, updateArray);
    logger.debug({ label: 'update a comment query response', results: updateQuery.rows });

    return { 'message': 'Updated comment successfully', id: updateQuery.rows[0] };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not update comment';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function getAllPostCommentsExternal
 * @summary Get all post's comments from database
 * @param {number} postId Post's id
 * @param {string} sortOrder Sort order (asc or desc)
 * @param {number} limit
 * @param {number} offset
 * @param {object} user User information
 * @returns {object} getPostsResults
 * @throws {object} errorCodeAndMsg
 */
const getAllPostCommentsExternal = async function getAllPostCommentsExternal(postId, sortOrder, limit, offset, user) {
  try {
    if (!postId || !sortOrder || !limit || (!offset && offset !== 0)) throw { code: 400, message: 'Please enter required postId, sort order (asc, or desc) limit, and offset' };

    if (sortOrder !== 'asc' && sortOrder !== 'desc') throw { code: 400, message: 'Please select required sortOrder (asc or desc)' };

    if (limit > 50) throw { code: 400, message: 'Maximum limit is 50' };

    const queryResults = await db.query(`select id, post_id, create_date, body, solution, username from comments where post_id=$1 and status='published' order by create_date ${sortOrder} limit ${limit} offset ${offset}`, [postId]);
    logger.debug({ label: 'get all post comments query response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) {
      return queryResults.rows;
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get all post comments';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function getAllPostSolutionsExternal
 * @summary Get all post's solutions from database
 * @param {number} postId Post's id
 * @param {string} sortOrder Sort order (asc or desc)
 * @param {number} limit
 * @param {number} offset
 * @param {object} user User information
 * @returns {object} getPostsResults
 * @throws {object} errorCodeAndMsg
 */
const getAllPostSolutionsExternal = async function getAllPostSolutionsExternal(postId, sortOrder, limit, offset, user) {
  try {
    if (!postId || !sortOrder || !limit || (!offset && offset !== 0)) throw { code: 400, message: 'Please enter required postId, sort order (asc, or desc) limit, offset, and a company' };

    if (sortOrder !== 'asc' && sortOrder !== 'desc') throw { code: 400, message: 'Please select required sortOrder (asc or desc)' };

    if (limit > 50) throw { code: 400, message: 'Maximum limit is 50' };

    const queryResults = await db.query(`select id, post_id, create_date, body, solution, username from comments where post_id=$1 and solution=true order by create_date ${sortOrder} limit ${limit} offset ${offset}`, [postId]);
    logger.debug({ label: 'get all post solutions query response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) {
      return queryResults.rows;
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get all post solutions';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

module.exports = {
  newComment,
  deleteComment,
  getCommentExternal,
  modifyComment,
  getAllPostCommentsExternal,
  getAllPostSolutionsExternal
};
