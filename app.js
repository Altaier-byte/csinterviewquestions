require('dotenv').config();

// Require
const express = require('express');
const methodOverride = require('method-override');
const expressSanitizer = require('express-sanitizer');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const requestIp = require('request-ip');
const cookieParser = require('cookie-parser');
const { logger } = require('./src/logger');

// Require routes
const authorizationRoutes = require('./routes/authorization');
const postRoutes = require('./routes/post');
const commentRoutes = require('./routes/comments');
const systemRoutes = require('./routes/system');
const filesRoutes = require('./routes/files');

// Application Setup
const app = express();
const serverPort = 3030;
const serverUrl = 'localhost';

// App Configurations
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({
  extended: true
}));
app.use(expressSanitizer());
app.use(methodOverride('_method'));
app.use(express.json());
app.use(requestIp.mw());
app.use(cookieParser());
// app.use(errorHandler({ dumpExceptions: true, showStack: true }));

// Routes

// Index Route
app.get('/', async function (req, res) {
  res.status(200).send('Hi from csinterviewquestions backend');
});

// Authentication routes
app.use(authorizationRoutes);

// Post routes
app.use(postRoutes);

// Comments routes
app.use(commentRoutes);

// System and stats routes
app.use(systemRoutes);

// Files routes
app.use(filesRoutes);

// Not Found Route
app.get('*', function (req, res) {
  res.render('notFound');
});

// Start server on specified url and port
app.listen(serverPort, serverUrl, function () {
  logger.info('Application started successfully...');
  logger.info(`Server can be accessed on http://${serverUrl}:${serverPort}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(reason);
});

process.on('uncaughtException', (reason) => {
  console.log(reason);
});
