const moment = require('moment');
const Filter = require('bad-words');
const randomstring = require('randomstring');
const bcrypt = require('bcrypt');
const filter = new Filter();
const { logger } = require('./logger');
const db = require('../db/db');
const { isHttpErrorCode, sendEmailText } = require('./tools');

/**
 * @function newPost
 * @summary Create a new post
 * @param {string} title Title
 * @param {string} interviewDate Interview date
 * @param {string} company Company
 * @param {string} position Position or title
 * @param {string} body Body or description
 * @param {object} user User information
 * @returns {object} newPostResults
 * @throws {object} errorCodeAndMsg
 */
const newPost = async function newPost(title, interviewDate, company, position, body, user) {
  try {
    // Check if there is no email or password
    if (!title || !interviewDate || !company || !position) {
      throw { code: 400, message: 'Please provide project title, interview date, company, position' };
    }

    title = filter.clean(title);
    company = filter.clean(company);
    position = filter.clean(position);
    body = body ? filter.clean(body) : body;

    // Get date
    const createDate = moment().format('MM/DD/YYYY');

    // Create a pin
    const pin = randomstring.generate(12);

    // Hash the pin
    const pinHashed = await bcrypt.hash(pin, 12);

    // Create a new post in the databsae
    const postQuery = await db.query('insert into posts(title, interview_date, company, position, body, status, pin, create_date) VALUES($1, $2, $3, $4, $5, $6, $7, $8) returning id', [title, interviewDate, company, position, body, 'published', pinHashed, createDate]);
    logger.debug({ label: 'create new project query response', results: postQuery.rows });

    // Send an email with the pin
    const subject = 'Post Published - You\'re Admin PIN is Here!';
    const message = `You're post is published, please use this PIN to edit or delete your post in the future!
    Post Title: ${title}
    Post PIN: ${pin}`;
    const sendEmail = await sendEmailText(user.email, subject, message);

    if (sendEmail) {
      return { message: 'Post have been published successfully, and email has been sent with the your admin pin.', id: postQuery.rows[0].id };
    } else {
      throw { code: 500, message: 'Could not send post pin email' };
    }
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not create post';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function setPostStatus
 * @summary Set a post's status in database
 * @param {number} postId Post's id
 * @param {string} status Post's status
 * @returns {object} setPostResults
 * @throws {boolean} false
 */
const setPostStatus = async function setPostStatus(postId, status) {
  if (!postId || !status) throw { code: 400, message: 'Please provide a post id and status' };

  const queryResults = await db.query('update posts set status=$1 where id=$2 returning id', [status, postId]);
  logger.debug({ label: 'set a post\'s status response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function incrementPostViews
 * @summary Set a post's views in database
 * @param {number} postId Post's id
 * @returns {object} setPostResults
 * @throws {boolean} false
 */
const incrementPostViews = async function incrementPostViews(postId) {
  if (!postId) throw { code: 400, message: 'Please provide a post id' };

  const queryResults = await db.query('update posts set views=views+1 where id=$1 returning views', [postId]);
  logger.debug({ label: 'set a post\'s views response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function getPost
 * @summary Get a post from database
 * @param {number} postId Post's id
 * @returns {object} getPostResults
 * @throws {boolean} false
 */
const getPost = async function getPost(postId) {
  if (!postId) throw { code: 400, message: 'Please provide a post id' };

  const queryResults = await db.query('select * from posts where id=$1', [postId]);
  logger.debug({ label: 'get a post query response', results: queryResults.rows });

  if (queryResults && queryResults.rows[0]) return queryResults.rows[0];
  else return false;
};

/**
 * @function getPostExternal
 * @summary Get a post from database
 * @param {number} postId Post's id
 * @param {object} user User information
 * @returns {object} newPostResults
 * @throws {object} errorCodeAndMsg
 */
const getPostExternal = async function getPostExternal(postId) {
  try {
    if (!postId) throw { code: 400, message: 'Please provide a post id' };

    const queryResults = await db.query('select id, title, create_date, interview_date, company, body, position, votes_up, votes_down, views from posts where id=$1', [postId]);
    logger.debug({ label: 'get a post query response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) {
      incrementPostViews(postId);
      return queryResults.rows[0];
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get a post';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function deletePost
 * @summary Delete a post
 * @param {number} postId Post's id
 * @param {string} pin Post's pin
 * @param {object} user User information
 * @returns {object} postDeleteResults
 * @throws {object} errorCodeAndMsg
 */
const deletePost = async function deletePost(postId, postPin, user) {
  try {
    if (!postId || !postPin) throw { code: 400, message: 'Please provide a post id and it\'s admin pin' };

    // Get post
    const postDb = await getPost(postId);
    if (!postDb) throw { code: 404, message: 'Could not find requested post' };

    // Compare post pin to the pin
    const postHash = postDb.pin;
    const validatePin = bcrypt.compare(postPin, postHash);
    if (!validatePin) throw { code: 401, message: 'Please check pin and post' };

    // Delete post
    const setPostDb = await setPostStatus(postId, 'deleted');
    if (!setPostDb) throw { code: 500, message: 'Could not delete post' };

    return { 'message': 'Deleted post successfully' };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not delete project';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function modifyPost
 * @summary Modify a post
 * @param {number} postId Post's id
 * @param {string} pin Post's pin
 * @param {string} title Title
 * @param {string} interviewDate Interview date
 * @param {string} company Company
 * @param {string} position Position or title
 * @param {string} body Body or description
 * @param {object} user User information
 * @returns {object} newPostResults
 * @throws {object} errorCodeAndMsg
 */
const modifyPost = async function modifyPost(postId, postPin, title, interviewDate, company, position, body, user) {
  try {
    if (!postId || !postPin) throw { code: 400, message: 'Please provide a post id and it\'s admin pin' };

    // Get post
    const postDb = await getPost(postId);
    if (!postDb) throw { code: 404, message: 'Could not find requested post' };

    // Compare post pin to the pin
    const postHash = postDb.pin;
    const validatePin = bcrypt.compare(postPin, postHash);
    if (!validatePin) throw { code: 401, message: 'Please check pin and post' };

    // Clean language
    title = title ? filter.clean(title) : title;
    company = company ? filter.clean(company) : company;
    position = position ? filter.clean(position) : position;
    body = body ? filter.clean(body) : body;

    // Update post
    let count = 1;
    let updateString = 'update posts';
    const updateArray = [];

    if (title) {
      updateString = `${updateString} set title=$${count}`;
      count += 1;
      updateArray.push(title);
    }
    if (company) {
      updateString = `${updateString} set company=$${count}`;
      count += 1;
      updateArray.push(company);
    }
    if (position) {
      updateString = `${updateString} set position=$${count}`;
      count += 1;
      updateArray.push(position);
    }
    if (body) {
      updateString = `${updateString} set body=$${count}`;
      count += 1;
      updateArray.push(body);
    }
    if (interviewDate) {
      updateString = `${updateString} set interview_date=$${count}`;
      count += 1;
      updateArray.push(interviewDate);
    }

    updateString = `${updateString} where id=$${count} returning id`;
    updateArray.push(postId);

    const updateQuery = await db.query(updateString, updateArray);
    logger.debug({ label: 'update a post query response', results: updateQuery.rows });

    return { 'message': 'Updated post successfully', id: updateQuery.rows[0] };
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not update project';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

module.exports = {
  newPost,
  deletePost,
  getPostExternal,
  modifyPost
};
