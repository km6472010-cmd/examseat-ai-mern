/**
 * Express app assembly. Port of the original backend/main.py.
 */
'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { settings } = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const sessionsRouter = require('./routes/sessions');
const seatingRouter = require('./routes/seating');
const classroomRouter = require('./routes/classroom');
const verifyRouter = require('./routes/verify');
const jobsRouter = require('./routes/jobs');
const resultsRouter = require('./routes/results');
const reviewsRouter = require('./routes/reviews');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');
const demoRouter = require('./routes/demo');

function createApp() {
  const app = express();

  app.use(cors({ origin: settings.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', app: settings.APP_NAME }));

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/seating', seatingRouter);
  app.use('/api/classroom', classroomRouter);
  app.use('/api/verify', verifyRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/results', resultsRouter);
  app.use('/api', reviewsRouter); // reviews.js defines its own /reviews/... prefix
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/demo', demoRouter);

  // Serve uploaded/processed/demo evidence images so the frontend can render
  // overlays, seating-plan scans, etc. Never publicly indexed -- see README >
  // Privacy for production hardening notes (auth, signed URLs, retention).
  app.use('/media/uploads', express.static(settings.UPLOADS_DIR));
  app.use('/media/processed', express.static(settings.PROCESSED_DIR));
  app.use('/media/demo', express.static(settings.DEMO_DIR));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
