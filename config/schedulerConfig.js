/**
 * Scheduler Configuration for SBI Data Fetching
 * 
 * This file contains configuration for automated SBI data fetching
 * including states to fetch, scheduling times, and retry policies.
 */

const SCHEDULER_CONFIG = {
  // Cron schedule for nightly data fetch (10:30 PM daily)
  schedule: '30 22 * * *', // 22:30 (10:30 PM) every day
  
  // Timezone for scheduling
  timezone: 'Asia/Kolkata',
  
  // States to fetch data for (all major states)
  states: [
    'NCT OF DELHI',
    'UTTAR PRADESH', 
    'MAHARASHTRA',
    'WEST BENGAL',
    'BIHAR',
    'MADHYA PRADESH',
    'TAMIL NADU',
    'RAJASTHAN',
    'KARNATAKA',
    'GUJARAT',
    'ANDHRA PRADESH',
    'ODISHA',
    'TELANGANA',
    'KERALA',
    'JHARKHAND',
    'ASSAM',
    'PUNJAB',
    'CHHATTISGARH',
    'HARYANA',
    'JAMMU AND KASHMIR',
    'UTTARAKHAND',
    'HIMACHAL PRADESH',
    'TRIPURA',
    'MEGHALAYA',
    'MANIPUR',
    'NAGALAND',
    'GOA',
    'ARUNACHAL PRADESH',
    'MIZORAM',
    'SIKKIM',
    'ANDAMAN AND NICOBAR ISLANDS',
    'CHANDIGARH',
    'DADRA AND NAGAR HAVELI',
    'DAMAN AND DIU',
    'LAKSHADWEEP',
    'PUDUCHERRY'
  ],
  
  // Priority states (fetch these first)
  priorityStates: [
    'NCT OF DELHI',
    'UTTAR PRADESH',
    'MAHARASHTRA',
    'WEST BENGAL',
    'BIHAR'
  ],
  
  // Retry configuration
  retry: {
    maxAttempts: 3,
    delayBetweenAttempts: 5000, // 5 seconds
    exponentialBackoff: true
  },
  
  // Batch processing configuration
  batch: {
    statesPerBatch: 5, // Process 5 states at a time
    delayBetweenBatches: 10000, // 10 seconds between batches
    maxConcurrentRequests: 3
  },
  
  // Data retention policy
  dataRetention: {
    keepDays: 90, // Keep data for 90 days
    cleanupSchedule: '0 2 * * 0', // Clean up every Sunday at 2 AM
  },
  
  // Logging configuration
  logging: {
    enabled: true,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    logToFile: true,
    logFilePath: './logs/scheduler.log'
  },
  
  // Notification configuration (for future use)
  notifications: {
    enabled: false,
    onSuccess: false,
    onError: true,
    email: null, // Add email for notifications
    webhook: null // Add webhook URL for notifications
  }
};

/**
 * Get date in DD-MM-YYYY format for SBI API
 */
function getCurrentDateForSBI() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Get previous date in DD-MM-YYYY format for SBI API
 */
function getPreviousDateForSBI(daysBack = 1) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Get states in priority order
 */
function getStatesInPriorityOrder() {
  const priorityStates = SCHEDULER_CONFIG.priorityStates;
  const otherStates = SCHEDULER_CONFIG.states.filter(state => 
    !priorityStates.includes(state)
  );
  return [...priorityStates, ...otherStates];
}

/**
 * Split states into batches for processing
 */
function getStateBatches() {
  const states = getStatesInPriorityOrder();
  const batchSize = SCHEDULER_CONFIG.batch.statesPerBatch;
  const batches = [];
  
  for (let i = 0; i < states.length; i += batchSize) {
    batches.push(states.slice(i, i + batchSize));
  }
  
  return batches;
}

module.exports = {
  SCHEDULER_CONFIG,
  getCurrentDateForSBI,
  getPreviousDateForSBI,
  getStatesInPriorityOrder,
  getStateBatches
};
