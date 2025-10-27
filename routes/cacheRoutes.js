/**
 * Cache Routes
 * Routes for cache management functionality
 */

const express = require('express');
const router = express.Router();

// Cache status endpoint
router.get('/status', (req, res) => {
  res.json({
    message: 'Cache status endpoint',
    timestamp: new Date().toISOString()
  });
});

// Clear cache endpoint
router.post('/clear', (req, res) => {
  res.json({
    message: 'Cache cleared',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
