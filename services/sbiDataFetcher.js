/**
 * SBI Data Fetcher Service
 * 
 * Automated service to fetch SBI DLC data for all states
 * Handles batch processing, retries, and error handling
 */

const SBIOfficialAPIClient = require('../utils/sbiOfficialAPIClient');
const SBIDataModel = require('../models/SBIDataModel');
const SBIDataConverter = require('../utils/sbiDataConverter');
const { 
  SCHEDULER_CONFIG, 
  getCurrentDateForSBI, 
  getPreviousDateForSBI,
  getStateBatches 
} = require('../config/schedulerConfig');
const fs = require('fs').promises;
const path = require('path');

class SBIDataFetcher {
  constructor() {
    this.sbiClient = new SBIOfficialAPIClient();
    this.isRunning = false;
    this.currentRun = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunTime: null,
      lastRunStatus: null,
      totalStatesFetched: 0,
      totalRecordsFetched: 0
    };
  }

  /**
   * Main method to fetch data for all states
   */
  async fetchAllStatesData(requestDate = null) {
    if (this.isRunning) {
      this.log('warn', 'Data fetch already in progress, skipping...');
      return { success: false, message: 'Already running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const runId = `run_${Date.now()}`;
    
    // Use current date if not provided
    const fetchDate = requestDate || getCurrentDateForSBI();
    
    this.currentRun = {
      id: runId,
      startTime,
      date: fetchDate,
      states: [],
      totalStates: 0,
      successfulStates: 0,
      failedStates: 0,
      totalRecords: 0,
      errors: []
    };

    this.log('info', `🚀 Starting automated SBI data fetch for date: ${fetchDate}`);
    this.log('info', `📋 Run ID: ${runId}`);

    try {
      // Get state batches for processing
      const stateBatches = getStateBatches();
      this.currentRun.totalStates = stateBatches.flat().length;
      
      this.log('info', `📊 Processing ${this.currentRun.totalStates} states in ${stateBatches.length} batches`);

      // Process each batch
      for (let batchIndex = 0; batchIndex < stateBatches.length; batchIndex++) {
        const batch = stateBatches[batchIndex];
        this.log('info', `🔄 Processing batch ${batchIndex + 1}/${stateBatches.length}: [${batch.join(', ')}]`);

        // Process states in current batch concurrently
        const batchPromises = batch.map(state => 
          this.fetchStateDataWithRetry(state, fetchDate)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process batch results
        batchResults.forEach((result, index) => {
          const state = batch[index];
          if (result.status === 'fulfilled' && result.value.success) {
            this.currentRun.successfulStates++;
            this.currentRun.totalRecords += result.value.recordCount || 0;
            this.log('info', `✅ ${state}: ${result.value.recordCount || 0} records`);
          } else {
            this.currentRun.failedStates++;
            const error = result.status === 'rejected' ? result.reason : result.value.error;
            this.currentRun.errors.push({ state, error: error.message || error });
            this.log('error', `❌ ${state}: ${error.message || error}`);
          }
        });

        // Delay between batches (except for last batch)
        if (batchIndex < stateBatches.length - 1) {
          this.log('info', `⏳ Waiting ${SCHEDULER_CONFIG.batch.delayBetweenBatches}ms before next batch...`);
          await this.delay(SCHEDULER_CONFIG.batch.delayBetweenBatches);
        }
      }

      // Calculate final statistics
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.currentRun.endTime = endTime;
      this.currentRun.duration = duration;

      // Update global stats
      this.stats.totalRuns++;
      this.stats.lastRunTime = new Date().toISOString();
      this.stats.totalStatesFetched += this.currentRun.successfulStates;
      this.stats.totalRecordsFetched += this.currentRun.totalRecords;

      if (this.currentRun.failedStates === 0) {
        this.stats.successfulRuns++;
        this.stats.lastRunStatus = 'success';
        this.log('info', `🎉 All states processed successfully!`);
      } else {
        this.stats.failedRuns++;
        this.stats.lastRunStatus = 'partial_success';
        this.log('warn', `⚠️ ${this.currentRun.failedStates} states failed to process`);
      }

      // Log final summary
      this.log('info', `📊 Run Summary:`);
      this.log('info', `   Duration: ${Math.round(duration / 1000)}s`);
      this.log('info', `   Successful: ${this.currentRun.successfulStates}/${this.currentRun.totalStates}`);
      this.log('info', `   Total Records: ${this.currentRun.totalRecords}`);
      this.log('info', `   Errors: ${this.currentRun.errors.length}`);

      // Save run report
      await this.saveRunReport();

      // Auto-convert new SBI data to existing pension master table
      if (this.currentRun.totalRecords > 0) {
        this.log('info', '🔄 Auto-converting new SBI data to pension master format...');
        try {
          const conversionResult = await SBIDataConverter.convertAllSBIRecords();
          this.log('info', `✅ Converted ${conversionResult.converted} SBI records to pension master`);
        } catch (conversionError) {
          this.log('error', `❌ Auto-conversion failed: ${conversionError.message}`);
        }
      }

      return {
        success: this.currentRun.failedStates === 0,
        runId,
        summary: {
          date: fetchDate,
          duration: Math.round(duration / 1000),
          totalStates: this.currentRun.totalStates,
          successfulStates: this.currentRun.successfulStates,
          failedStates: this.currentRun.failedStates,
          totalRecords: this.currentRun.totalRecords,
          errors: this.currentRun.errors
        }
      };

    } catch (error) {
      this.log('error', `💥 Fatal error in data fetch: ${error.message}`);
      this.stats.failedRuns++;
      this.stats.lastRunStatus = 'failed';
      
      return {
        success: false,
        error: error.message,
        runId
      };
    } finally {
      this.isRunning = false;
      this.currentRun = null;
    }
  }

  /**
   * Fetch data for a single state with retry logic
   */
  async fetchStateDataWithRetry(state, requestDate) {
    const maxAttempts = SCHEDULER_CONFIG.retry.maxAttempts;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log('debug', `🔄 ${state}: Attempt ${attempt}/${maxAttempts}`);
        
        const result = await this.sbiClient.fetchDLCData(state, requestDate);
        
        if (result.success) {
          // Extract record count from result
          let recordCount = 0;
          if (result.recordsResponse && result.recordsResponse.data) {
            if (result.recordsResponse.data.EIS_RESPONSE && result.recordsResponse.data.EIS_RESPONSE.data) {
              try {
                const parsedData = JSON.parse(result.recordsResponse.data.EIS_RESPONSE.data);
                recordCount = parsedData.Verification_Records ? parsedData.Verification_Records.length : 0;
              } catch (parseError) {
                this.log('warn', `${state}: Could not parse record count`);
              }
            }
          }

          return {
            success: true,
            state,
            batchId: result.batchId,
            recordCount,
            attempt
          };
        } else {
          throw new Error('SBI API returned unsuccessful response');
        }

      } catch (error) {
        lastError = error;
        this.log('warn', `${state}: Attempt ${attempt} failed: ${error.message}`);
        
        // Wait before retry (with exponential backoff if configured)
        if (attempt < maxAttempts) {
          const delay = SCHEDULER_CONFIG.retry.exponentialBackoff 
            ? SCHEDULER_CONFIG.retry.delayBetweenAttempts * Math.pow(2, attempt - 1)
            : SCHEDULER_CONFIG.retry.delayBetweenAttempts;
          
          await this.delay(delay);
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      state,
      error: lastError,
      attempts: maxAttempts
    };
  }

  /**
   * Get current fetch status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentRun: this.currentRun,
      stats: this.stats,
      config: {
        schedule: SCHEDULER_CONFIG.schedule,
        totalStates: SCHEDULER_CONFIG.states.length,
        priorityStates: SCHEDULER_CONFIG.priorityStates.length
      }
    };
  }

  /**
   * Clean old data based on retention policy
   */
  async cleanOldData() {
    try {
      this.log('info', '🧹 Starting data cleanup...');
      
      const result = await SBIDataModel.cleanOldData(SCHEDULER_CONFIG.dataRetention.keepDays);
      
      this.log('info', `✅ Cleaned ${result.deleted} old records (older than ${SCHEDULER_CONFIG.dataRetention.keepDays} days)`);
      
      return result;
    } catch (error) {
      this.log('error', `❌ Data cleanup failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save run report to file
   */
  async saveRunReport() {
    if (!this.currentRun) return;

    try {
      const reportsDir = path.join(__dirname, '..', 'logs', 'reports');
      
      // Ensure reports directory exists
      try {
        await fs.access(reportsDir);
      } catch {
        await fs.mkdir(reportsDir, { recursive: true });
      }

      const reportFile = path.join(reportsDir, `sbi_fetch_${this.currentRun.id}.json`);
      const report = {
        ...this.currentRun,
        timestamp: new Date().toISOString(),
        config: {
          schedule: SCHEDULER_CONFIG.schedule,
          retryConfig: SCHEDULER_CONFIG.retry,
          batchConfig: SCHEDULER_CONFIG.batch
        }
      };

      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      this.log('info', `📄 Run report saved: ${reportFile}`);
    } catch (error) {
      this.log('error', `❌ Failed to save run report: ${error.message}`);
    }
  }

  /**
   * Utility method for delays
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging method
   */
  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} [SBI-FETCHER] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    
    // Log to file if configured
    if (SCHEDULER_CONFIG.logging.logToFile) {
      this.logToFile(logMessage);
    }
  }

  /**
   * Log to file
   */
  async logToFile(message) {
    try {
      const logDir = path.dirname(SCHEDULER_CONFIG.logging.logFilePath);
      
      // Ensure log directory exists
      try {
        await fs.access(logDir);
      } catch {
        await fs.mkdir(logDir, { recursive: true });
      }

      await fs.appendFile(SCHEDULER_CONFIG.logging.logFilePath, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }
}

module.exports = SBIDataFetcher;
