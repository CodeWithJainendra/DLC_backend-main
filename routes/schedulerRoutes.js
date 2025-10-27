/**
 * Scheduler Routes
 * 
 * API endpoints for managing the automated scheduler service
 */

const express = require('express');
const router = express.Router();
const schedulerService = require('../services/schedulerService');
const { getCurrentDateForSBI, getPreviousDateForSBI } = require('../config/schedulerConfig');

/**
 * Get scheduler status
 */
router.get('/status', async (req, res) => {
  try {
    const status = schedulerService.getStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Start scheduler service
 */
router.post('/start', async (req, res) => {
  try {
    if (!schedulerService.getStatus().initialized) {
      await schedulerService.initialize();
    }
    
    await schedulerService.startAllTasks();
    
    res.json({
      success: true,
      message: 'Scheduler service started successfully',
      status: schedulerService.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Stop scheduler service
 */
router.post('/stop', async (req, res) => {
  try {
    await schedulerService.stopAllTasks();
    
    res.json({
      success: true,
      message: 'Scheduler service stopped successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Manually trigger SBI data fetch
 */
router.post('/trigger-fetch', async (req, res) => {
  try {
    const { date } = req.body;
    
    // Validate date format if provided
    let requestDate = date;
    if (requestDate) {
      // Check if date is in DD-MM-YYYY format
      const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateRegex.test(requestDate)) {
        return res.status(400).json({
          success: false,
          error: 'Date must be in DD-MM-YYYY format',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const result = await schedulerService.triggerManualFetch(requestDate);
    
    res.json({
      success: true,
      message: 'Manual data fetch triggered successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Enable/disable a specific task
 */
router.post('/task/:taskName/:action', async (req, res) => {
  try {
    const { taskName, action } = req.params;
    
    if (!['enable', 'disable'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action must be either "enable" or "disable"',
        timestamp: new Date().toISOString()
      });
    }
    
    const enabled = action === 'enable';
    schedulerService.setTaskEnabled(taskName, enabled);
    
    res.json({
      success: true,
      message: `Task ${taskName} ${enabled ? 'enabled' : 'disabled'} successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get SBI data fetcher status
 */
router.get('/sbi-fetcher/status', async (req, res) => {
  try {
    const status = schedulerService.getStatus().sbiDataFetcher;
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Trigger data cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { days } = req.body;
    const daysToKeep = days || 90;
    
    const SBIDataModel = require('../models/SBIDataModel');
    const result = await SBIDataModel.cleanOldData(daysToKeep);
    
    res.json({
      success: true,
      message: `Data cleanup completed successfully`,
      data: {
        deletedRecords: result.deleted,
        cutoffDate: result.cutoffDate,
        daysKept: daysToKeep
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get current date for SBI API format
 */
router.get('/current-date', (req, res) => {
  try {
    const currentDate = getCurrentDateForSBI();
    const previousDate = getPreviousDateForSBI();
    
    res.json({
      success: true,
      data: {
        currentDate,
        previousDate,
        format: 'DD-MM-YYYY'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get scheduler configuration
 */
router.get('/config', (req, res) => {
  try {
    const { SCHEDULER_CONFIG } = require('../config/schedulerConfig');
    
    res.json({
      success: true,
      data: {
        schedule: SCHEDULER_CONFIG.schedule,
        timezone: SCHEDULER_CONFIG.timezone,
        totalStates: SCHEDULER_CONFIG.states.length,
        priorityStates: SCHEDULER_CONFIG.priorityStates,
        retry: SCHEDULER_CONFIG.retry,
        batch: SCHEDULER_CONFIG.batch,
        dataRetention: SCHEDULER_CONFIG.dataRetention,
        logging: SCHEDULER_CONFIG.logging
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Health check for scheduler
 */
router.get('/health', (req, res) => {
  try {
    const status = schedulerService.getStatus();
    const isHealthy = status.initialized && !status.sbiDataFetcher.isRunning;
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      data: {
        initialized: status.initialized,
        totalTasks: Object.keys(status.tasks).length,
        runningTasks: Object.values(status.tasks).filter(t => t.running).length,
        sbiDataFetcherRunning: status.sbiDataFetcher.isRunning,
        lastTaskExecution: status.stats.lastTaskExecution
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
