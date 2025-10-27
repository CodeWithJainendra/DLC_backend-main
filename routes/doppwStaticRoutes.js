/**
 * DOPPW Static Routes
 * Routes for DOPPW static data functionality
 */

const express = require('express');
const router = express.Router();

// DOPPW static data endpoint
router.get('/data', (req, res) => {
  res.json({
    message: 'DOPPW static data endpoint',
    timestamp: new Date().toISOString()
  });
});

// DOPPW static stats endpoint
router.get('/stats', (req, res) => {
  res.json({
    message: 'DOPPW static stats endpoint',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
