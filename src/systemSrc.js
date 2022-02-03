const { logger } = require('./logger');
const db = require('../db/db');
const packageJSONFile = require('../package.json');
const { isHttpErrorCode } = require('./tools');

/**
 * @function getPositionsStats
 * @summary Get positions stats i.e position and number of posts per position
 * @param {object} user User information
 * @returns {object} getPositionsStatsResults
 * @throws {object} errorCodeAndMsg
 */
const getPositionsStats = async function getPositionsStats(user) {
  try {
    const queryResults = await db.query('select position, count(*) from posts group by position order by count desc', []);
    logger.debug({ label: 'get all positions stats response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) {
      return queryResults.rows;
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get all positions stats';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function getCompaniesStats
 * @summary Get companies stats i.e company and number of posts per company
 * @param {object} user User information
 * @returns {object} getCompaniesStatsResults
 * @throws {object} errorCodeAndMsg
 */
const getCompaniesStats = async function getCompaniesStats(user) {
  try {
    const queryResults = await db.query('select company, count(*) from posts group by company order by count desc', []);
    logger.debug({ label: 'get all companies stats response', results: queryResults.rows });

    if (queryResults && queryResults.rows[0]) {
      return queryResults.rows;
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get all companies stats';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function getSystemVersion
 * @summary Get system version
 * @param {object} user User information
 * @returns {object} systemVersionResults
 * @throws {object} errorCodeAndMsg
 */
const getSystemVersion = async function getSystemVersion(user) {
  try {
    const version = packageJSONFile['version'];
    logger.debug({ label: 'system version response', results: version });

    if (version) {
      return version;
    } else return false;
  } catch (error) {
    if (error.code && isHttpErrorCode(error.code)) {
      logger.error(error);
      throw error;
    }
    const userMsg = 'Could not get system version';
    logger.error({ userMsg, error });
    throw { code: 500, message: userMsg };
  }
};

/**
 * @function systemPing
 * @summary Ping system and return success if this call reachable
 * @param {object} user User information
 * @returns {object} systemPingResults
 * @throws {object} errorCodeAndMsg
 */
const systemPing = async function systemPing(user) {
  return 'Hi! Successful ping!';
};

module.exports = {
  getPositionsStats,
  getCompaniesStats,
  getSystemVersion,
  systemPing
};
