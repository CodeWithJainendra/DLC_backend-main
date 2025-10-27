/**
 * Scheduler Service
 * 
 * Main scheduler service that manages automated tasks including:
 * - Nightly SBI data fetching
 * - Data cleanup tasks
 * - Health monitoring
 */

const cron = require('node-cron');
const SBIDataFetcher = require('./sbiDataFetcher');
const { SCHEDULER_CONFIG } = require('../config/schedulerConfig');

class SchedulerService {
  constructor() {
    this.sbiDataFetcher = new SBIDataFetcher();
    this.scheduledTasks = new Map();
    this.isInitialized = false;
    this.stats = {
      startTime: null,
      totalTasksScheduled: 0,
      totalTasksExecuted: 0,
      lastTaskExecution: null
    };
  }

  /**
   * Initialize the scheduler service
   */
  async initialize() {
    if (this.isInitialized) {
      this.log('warn', 'Scheduler already initialized');
      return;
    }

    this.log('info', '🕐 Initializing Scheduler Service...');
    this.stats.startTime = new Date().toISOString();

    try {
      // Schedule nightly SBI data fetch
      await this.scheduleNightlyDataFetch();
      
      // Schedule data cleanup task
      await this.scheduleDataCleanup();
      
      // Schedule health monitoring (optional)
      await this.scheduleHealthMonitoring();

      this.isInitialized = true;
      this.log('info', '✅ Scheduler Service initialized successfully');
      this.logScheduledTasks();

    } catch (error) {
      this.log('error', `❌ Failed to initialize scheduler: ${error.message}`);
      throw error;
    }
  }

  /**
   * Schedule nightly SBI data fetch
   */
  async scheduleNightlyDataFetch() {
    const taskName = 'nightly-sbi-fetch';
    
    this.log('info', `📅 Scheduling nightly SBI data fetch: ${SCHEDULER_CONFIG.schedule}`);
    
    const task = cron.schedule(SCHEDULER_CONFIG.schedule, async () => {
      this.log('info', '🌙 Starting scheduled nightly SBI data fetch...');
      this.stats.totalTasksExecuted++;
      this.stats.lastTaskExecution = new Date().toISOString();
      
      try {
        const result = await this.sbiDataFetcher.fetchAllStatesData();
        
        if (result.success) {
          this.log('info', `✅ Nightly data fetch completed successfully`);
          this.log('info', `📊 Summary: ${result.summary.successfulStates}/${result.summary.totalStates} states, ${result.summary.totalRecords} records`);
        } else {
          this.log('error', `⚠️ Nightly data fetch completed with errors`);
          if (result.summary) {
            this.log('error', `📊 Summary: ${result.summary.successfulStates}/${result.summary.totalStates} states, ${result.summary.errors.length} errors`);
          }
        }
      } catch (error) {
        this.log('error', `💥 Nightly data fetch failed: ${error.message}`);
      }
    }, {
      scheduled: false,
      timezone: SCHEDULER_CONFIG.timezone
    });

    this.scheduledTasks.set(taskName, {
      task,
      schedule: SCHEDULER_CONFIG.schedule,
      description: 'Nightly SBI DLC data fetch for all states',
      timezone: SCHEDULER_CONFIG.timezone,
      enabled: true
    });

    this.stats.totalTasksScheduled++;
  }

  /**
   * Schedule data cleanup task
   */
  async scheduleDataCleanup() {
    const taskName = 'data-cleanup';
    
    this.log('info', `📅 Scheduling data cleanup: ${SCHEDULER_CONFIG.dataRetention.cleanupSchedule}`);
    
    const task = cron.schedule(SCHEDULER_CONFIG.dataRetention.cleanupSchedule, async () => {
      this.log('info', '🧹 Starting scheduled data cleanup...');
      
      try {
        const result = await this.sbiDataFetcher.cleanOldData();
        this.log('info', `✅ Data cleanup completed: ${result.deleted} records cleaned`);
      } catch (error) {
        this.log('error', `❌ Data cleanup failed: ${error.message}`);
      }
    }, {
      scheduled: false,
      timezone: SCHEDULER_CONFIG.timezone
    });

    this.scheduledTasks.set(taskName, {
      task,
      schedule: SCHEDULER_CONFIG.dataRetention.cleanupSchedule,
      description: `Clean data older than ${SCHEDULER_CONFIG.dataRetention.keepDays} days`,
      timezone: SCHEDULER_CONFIG.timezone,
      enabled: true
    });

    this.stats.totalTasksScheduled++;
  }

  /**
   * Schedule health monitoring (runs every hour)
   */
  async scheduleHealthMonitoring() {
    const taskName = 'health-monitoring';
    const healthSchedule = '0 * * * *'; // Every hour
    
    this.log('info', `📅 Scheduling health monitoring: ${healthSchedule}`);
    
    const task = cron.schedule(healthSchedule, async () => {
      try {
        // Check database health
        const dbStats = await require('../models/SBIDataModel').getDataStatistics();
        
        // Log basic health info
        this.log('debug', `💓 Health check - DB records: ${dbStats.totalRecords || 0}, Batches: ${dbStats.totalBatches || 0}`);
        
        // Check if SBI fetcher is stuck
        const fetcherStatus = this.sbiDataFetcher.getStatus();
        if (fetcherStatus.isRunning && fetcherStatus.currentRun) {
          const runDuration = Date.now() - fetcherStatus.currentRun.startTime;
          const maxRunTime = 2 * 60 * 60 * 1000; // 2 hours
          
          if (runDuration > maxRunTime) {
            this.log('warn', `⚠️ SBI data fetch has been running for ${Math.round(runDuration / 60000)} minutes`);
          }
        }
      } catch (error) {
        this.log('error', `❌ Health monitoring failed: ${error.message}`);
      }
    }, {
      scheduled: false,
      timezone: SCHEDULER_CONFIG.timezone
    });

    this.scheduledTasks.set(taskName, {
      task,
      schedule: healthSchedule,
      description: 'Hourly health monitoring and status checks',
      timezone: SCHEDULER_CONFIG.timezone,
      enabled: true
    });

    this.stats.totalTasksScheduled++;
  }

  /**
   * Start all scheduled tasks
   */
  async startAllTasks() {
    if (!this.isInitialized) {
      throw new Error('Scheduler not initialized. Call initialize() first.');
    }

    this.log('info', '▶️ Starting all scheduled tasks...');
    
    let startedCount = 0;
    for (const [taskName, taskInfo] of this.scheduledTasks) {
      if (taskInfo.enabled) {
        taskInfo.task.start();
        startedCount++;
        this.log('info', `✅ Started task: ${taskName}`);
      } else {
        this.log('info', `⏸️ Skipped disabled task: ${taskName}`);
      }
    }

    this.log('info', `🚀 Started ${startedCount}/${this.scheduledTasks.size} scheduled tasks`);
  }

  /**
   * Stop all scheduled tasks
   */
  async stopAllTasks() {
    this.log('info', '⏹️ Stopping all scheduled tasks...');
    
    let stoppedCount = 0;
    for (const [taskName, taskInfo] of this.scheduledTasks) {
      if (taskInfo.task) {
        taskInfo.task.stop();
        stoppedCount++;
        this.log('info', `⏹️ Stopped task: ${taskName}`);
      }
    }

    this.log('info', `🛑 Stopped ${stoppedCount} scheduled tasks`);
  }

  /**
   * Manually trigger SBI data fetch
   */
  async triggerManualFetch(requestDate = null) {
    this.log('info', '🔧 Manual SBI data fetch triggered');
    
    try {
      const result = await this.sbiDataFetcher.fetchAllStatesData(requestDate);
      return result;
    } catch (error) {
      this.log('error', `❌ Manual fetch failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    const tasks = {};
    for (const [taskName, taskInfo] of this.scheduledTasks) {
      tasks[taskName] = {
        schedule: taskInfo.schedule,
        description: taskInfo.description,
        enabled: taskInfo.enabled,
        running: taskInfo.task ? taskInfo.task.running : false
      };
    }

    return {
      initialized: this.isInitialized,
      stats: this.stats,
      tasks,
      sbiDataFetcher: this.sbiDataFetcher.getStatus(),
      config: {
        timezone: SCHEDULER_CONFIG.timezone,
        totalStates: SCHEDULER_CONFIG.states.length,
        dataRetentionDays: SCHEDULER_CONFIG.dataRetention.keepDays
      }
    };
  }

  /**
   * Enable/disable a specific task
   */
  setTaskEnabled(taskName, enabled) {
    const taskInfo = this.scheduledTasks.get(taskName);
    if (!taskInfo) {
      throw new Error(`Task not found: ${taskName}`);
    }

    taskInfo.enabled = enabled;
    
    if (enabled) {
      taskInfo.task.start();
      this.log('info', `✅ Enabled task: ${taskName}`);
    } else {
      taskInfo.task.stop();
      this.log('info', `⏸️ Disabled task: ${taskName}`);
    }
  }

  /**
   * Log scheduled tasks information
   */
  logScheduledTasks() {
    this.log('info', '📋 Scheduled Tasks Summary:');
    for (const [taskName, taskInfo] of this.scheduledTasks) {
      this.log('info', `   • ${taskName}: ${taskInfo.schedule} (${taskInfo.description})`);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.log('info', '🔄 Shutting down scheduler service...');
    
    await this.stopAllTasks();
    
    this.log('info', '✅ Scheduler service shutdown complete');
  }

  /**
   * Logging method
   */
  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [SCHEDULER] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
