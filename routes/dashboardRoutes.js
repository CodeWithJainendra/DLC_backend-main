const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/cleanDashboardController');
const authMiddleware = require('../middleware/auth');

/**
 * @route GET /api/dashboard/overview
 * @desc Get comprehensive dashboard overview with all requested data
 * @access Private (requires authentication)
 */
router.get('/overview', 
  authMiddleware.authenticateToken,
  dashboardController.getDashboardOverview
);

/**
 * @route GET /api/dashboard/state/:stateCode
 * @desc Get detailed data for a specific state
 * @access Private (requires authentication)
 */
router.get('/state/:stateCode', 
  authMiddleware.authenticateToken,
  dashboardController.getStateDashboardData
);

module.exports = router;