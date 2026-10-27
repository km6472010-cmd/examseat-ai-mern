'use strict';

const express = require('express');
const { ExamSession, VerificationResult, Report } = require('../models');
const { computeSummary, generateCsvReport, generateJsonReport, generatePdfReport } = require('../services/reportService');

const router = express.Router();

const MEDIA_TYPES = { pdf: 'application/pdf', csv: 'text/csv', json: 'application/json' };
const GENERATORS = { pdf: generatePdfReport, csv: generateCsvReport, json: generateJsonReport };

router.get('/:sessionId/summary', async (req, res, next) => {
  try {
    const session = await ExamSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ detail: 'Exam session not found' });
    const results = await VerificationResult.find({ sessionId: session._id });
    return res.json(computeSummary(session, results));
  } catch (err) {
    return next(err);
  }
});

router.get('/:sessionId', async (req, res, next) => {
  try {
    const session = await ExamSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ detail: 'Exam session not found' });
    const format = (req.query.format || 'pdf').toLowerCase();
    if (!GENERATORS[format]) return res.status(422).json({ detail: `Unsupported report format: ${format}` });

    const results = await VerificationResult.find({ sessionId: session._id });
    if (!results.length) {
      return res.status(422).json({ detail: 'No verification results to report yet -- run a verification first.' });
    }

    const filePath = await GENERATORS[format](session, results);
    await Report.create({ sessionId: session._id, format, filePath: String(filePath) });

    return res.download(filePath, undefined, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
