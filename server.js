/**
 * DLC Backend Server
 * Main server file for DLC Pension Dashboard
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import database
const { initDatabase } = require('./config/database');

// Import routes
const pensionRoutes = require('./routes/pensionRoutes');
const advancedRoutes = require('./routes/advancedRoutes');
const mapRoutes = require('./routes/mapRoutes');
const cacheRoutes = require('./routes/cacheRoutes');
const sbiOfficialRoutes = require('./routes/sbiOfficialRoutes');
const schedulerRoutes = require('./routes/schedulerRoutes');
const sftpRoutes = require('./routes/sftpRoutes');
const sbiSFTPRoutes = require('./routes/sbiSFTPRoutes');
const sftpDiagnosticRoutes = require('./routes/sftpDiagnosticRoutes');
const authRoutes = require('./routes/authRoutes');
const doppwStaticRoutes = require('./routes/doppwStaticRoutes');
const doppwRoutes = require('./routes/doppwRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const excelAnalysisRoutes = require('./routes/excelAnalysisRoutes');
const elasticsearchRoutes = require('./routes/elasticsearchRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 9007;

// Trust proxy for rate limiting (required for reverse proxy setups)
app.set('trust proxy', 1);

// Fix double slash URLs from reverse proxy
app.use((req, res, next) => {
  // Normalize URL by removing multiple consecutive slashes
  req.url = req.url.replace(/\/+/g, '/');
  req.originalUrl = req.originalUrl.replace(/\/+/g, '/');
  
  // Log the cleaned URL for debugging
  if (req.url.includes('//')) {
    console.log(`URL before cleanup: ${req.originalUrl}`);
    console.log(`URL after cleanup: ${req.url}`);
  }
  
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      imgSrc: ["'self'", "data:", "https://*"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// CORS configuration - Allow all origins for now to fix CORS issues
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins for now to fix CORS issues
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  preflightContinue: false,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Static files middleware
app.use('/public', express.static('public'));

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.url} ${req.path} - IP: ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);         // Authentication routes
app.use('/api/pension', pensionRoutes);   // Existing pension routes
app.use('/api/advanced', advancedRoutes); // Advanced analytics routes
app.use('/api/analytics', analyticsRoutes); // Comprehensive analytics with filtering
app.use('/api/map', mapRoutes);           // Map data routes
app.use('/api/cache', cacheRoutes);       // Cache management routes
app.use('/api/sbi', sbiOfficialRoutes);   // SBI Official API routes
app.use('/api/scheduler', schedulerRoutes); // Scheduler management routes
app.use('/api/sftp', sftpRoutes);         // SBI SFG SFTP routes
app.use('/api/sbi-sftp', sbiSFTPRoutes);  // Dedicated SBI SFTP routes for your server
app.use('/api/sftp-diagnostic', sftpDiagnosticRoutes); // Enhanced SFTP diagnostic routes
app.use('/api/doppw-static', doppwStaticRoutes); // DOPPW static data management routes
app.use('/api/doppw', doppwRoutes); // DOPPW data routes (from pensioner_bank_master)
app.use('/api/excel', excelAnalysisRoutes); // Excel upload and analysis routes
app.use('/api/elasticsearch', elasticsearchRoutes); // Elasticsearch data management routes
app.use('/api/dashboard', dashboardRoutes); // Dashboard routes

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'DLC Pension Dashboard API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',

      sbi: {
        health: '/api/sbi/health',
        config: '/api/sbi/config',
        batchId: '/api/sbi/batch-id',
        records: '/api/sbi/records',
        dlcData: '/api/sbi/dlc-data',
        testCertificates: '/api/sbi/test/certificates',
        testComprehensive: '/api/sbi/test/comprehensive',
        testDelhi: '/api/sbi/test/delhi'
      },
      scheduler: {
        status: '/api/scheduler/status',
        start: '/api/scheduler/start',
        stop: '/api/scheduler/stop',
        triggerFetch: '/api/scheduler/trigger-fetch',
        health: '/api/scheduler/health',
        config: '/api/scheduler/config'
      },
      sftp: {
        status: '/api/sftp/status',
        test: '/api/sftp/test',
        testAll: '/api/sftp/test-all',
        list: '/api/sftp/list',
        download: '/api/sftp/download',
        upload: '/api/sftp/upload',
        downloads: '/api/sftp/downloads',
        syncDaily: '/api/sftp/sync-daily-data'
      },
      sbiSftp: {
        status: '/api/sbi-sftp/status',
        checkSetup: '/api/sbi-sftp/check-setup',
        testConnection: '/api/sbi-sftp/test-connection',
        listFiles: '/api/sbi-sftp/list-files',
        downloadFile: '/api/sbi-sftp/download-file'
      },
      sftpDiagnostic: {
        fullAnalysis: '/api/sftp-diagnostic/full-analysis',
        quickTest: '/api/sftp-diagnostic/quick-test',
        webPortalGuide: '/api/sftp-diagnostic/web-portal-guide'
      },
      sftpTest: {
        status: '/api/sftp-test/status',
        quickTest: '/api/sftp-test/quick-test',
        fullDiagnostic: '/api/sftp-test/full-diagnostic',
        webGuide: '/api/sftp-test/web-guide',
        testConnection: '/api/sftp-test/test-connection',
        listFiles: '/api/sftp-test/list-files'
      },
      doppw: {
        stats: '/api/doppw/stats',
        states: '/api/doppw/states',
        records: '/api/doppw/records',
        verificationTypes: '/api/doppw/verification-types',
        gcodes: '/api/doppw/gcodes',
        escrollCategories: '/api/doppw/escroll-categories',
        submissionStatus: '/api/doppw/submission-status'
      },
      analytics: {
        hierarchicalData: '/api/analytics/hierarchical-data?state=KARNATAKA',
        stateWiseBreakdown: '/api/analytics/state-wise-breakdown?gcode=CENTRAL',
        categoryWiseBreakdown: '/api/analytics/category-wise-breakdown?state=BIHAR',
        ageDistribution: '/api/analytics/age-distribution',
        combinedFilters: '/api/analytics/combined-filters?state=KARNATAKA&gcode=CENTRAL&age_group=70_80'
      },
      pension: {
        banks: '/api/pension/banks',
        analytics: '/api/pension/analytics',
        search: '/api/pension/search'
      },
      dashboard: {
        overview: '/api/dashboard/overview',
        stateData: '/api/dashboard/state/{stateCode}'
      },
      elasticsearch: {
        health: '/api/elasticsearch/health',
        uploadExcel: '/api/elasticsearch/upload-excel',
        search: '/api/elasticsearch/search?q=query&state=STATE&page=1&size=20',
        suggestions: '/api/elasticsearch/suggestions?field=state&query=kar',
        statistics: '/api/elasticsearch/statistics',
        export: '/api/elasticsearch/export?format=json&q=query',
        document: '/api/elasticsearch/document/{id}',
        reindex: '/api/elasticsearch/reindex'
      },
      excel: {
        analyzeElasticsearch: '/api/excel/analyze-and-insert-es',
        analyzeSQLite: '/api/excel/analyze-and-insert',
        preview: '/api/excel/preview',
        supportedTables: '/api/excel/supported-tables'
      },
      map: {
        states: '/api/map/states',
        districts: '/api/map/districts'
      }
    }
  });
});

// Root level routes for frontend compatibility (without /api/pension prefix)
app.use('/', pensionRoutes);              // Direct pension routes for frontend
app.use('/advanced', advancedRoutes);     // Direct advanced routes for frontend

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global Error Handler:', error);
  
  res.status(error.status || 500).json({
    error: error.message || 'Internal Server Error',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Stop scheduler first
  try {
    await schedulerService.shutdown();
  } catch (error) {
    console.error('Error shutting down scheduler:', error.message);
  }
  
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Stop scheduler first
  try {
    await schedulerService.shutdown();
  } catch (error) {
    console.error('Error shutting down scheduler:', error.message);
  }
  
  server.close(() => {
    console.log('Process terminated');
  });
});

// Initialize database
console.log('🔧 Initializing database...');
initDatabase();
console.log('✅ Database initialized');

// Initialize Elasticsearch
console.log('🔍 Initializing Elasticsearch...');
const { elasticsearchConfig } = require('./config/elasticsearch');
elasticsearchConfig.initialize().then((result) => {
  if (result.success) {
    console.log('✅ Elasticsearch initialized successfully');
  } else {
    console.log('⚠️  Elasticsearch initialization failed, continuing without it');
  }
}).catch(error => {
  console.log('⚠️  Elasticsearch not available, continuing without it');
});

// Initialize scheduler service
console.log('🕐 Initializing scheduler service...');
const schedulerService = require('./services/schedulerService');
schedulerService.initialize().then(() => {
  schedulerService.startAllTasks();
  console.log('✅ Scheduler service initialized and started');
}).catch(error => {
  console.error('❌ Failed to initialize scheduler:', error.message);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 DLC Pension Dashboard API Server Started');
  console.log('=' * 50);
  console.log(`📍 Server running on: http://0.0.0.0:${PORT}`);
  console.log(`📍 Local access: http://localhost:${PORT}`);
  console.log(`📍 Network access: http://172.30.3.232:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  console.log(`🏦 SBI Official API: http://localhost:${PORT}/api/sbi`);
  console.log(`💾 SBI Database: http://localhost:${PORT}/api/sbi/db/health`);
  console.log(`🔐 SBI Test: http://localhost:${PORT}/api/sbi/test/comprehensive`);

  console.log(`🕐 Scheduler API: http://localhost:${PORT}/api/scheduler/status`);
  console.log(`🔄 Manual Fetch: http://localhost:${PORT}/api/scheduler/trigger-fetch`);
  console.log(`📁 SFTP Status: http://localhost:${PORT}/api/sftp/status`);
  console.log(`🧪 SFTP Test: http://localhost:${PORT}/api/sftp/test-all`);
  console.log(`🔧 SBI SFTP Setup: http://localhost:${PORT}/api/sbi-sftp/check-setup`);
  console.log(`🔌 SBI SFTP Test: http://localhost:${PORT}/api/sbi-sftp/test-connection`);
  console.log(`📁 SBI SFTP Files: http://localhost:${PORT}/api/sbi-sftp/list-files`);
  console.log(`📄 Read SFTP_SOLUTION.md for complete guide`);
  console.log('=' * 50);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Node.js: ${process.version}`);
  console.log('=' * 50);
});

module.exports = app;
