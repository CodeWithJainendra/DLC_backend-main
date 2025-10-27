/**
 * DLC Backend Server - SBI UAT API Only
 * Minimal server with only SBI UAT API integration
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import database
const { initDatabase } = require('./config/database');

// Import SBI routes and auth routes
const sbiOfficialRoutes = require('./routes/sbiOfficialRoutes');
const authRoutes = require('./routes/authRoutes');
const simpleSBIRoutes = require('./routes/simpleSBIRoutes');

// Override complex auth middleware with simple auth for SBI-only server
process.env.USE_SIMPLE_AUTH = 'true';

const app = express();
const PORT = process.env.PORT || 9007;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
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

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
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
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SBI UAT API Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Authentication Routes - Login/logout functionality
app.use('/api/auth', authRoutes);

// Simple SBI API Routes - No session timeout
app.use('/api/simple-sbi', simpleSBIRoutes);

// SBI API Routes - Only these routes will be available
app.use('/api/sbi', sbiOfficialRoutes);

// Root endpoint with SBI API documentation
app.get('/', (req, res) => {
  res.json({
    message: 'DLC SBI UAT API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    description: 'Minimal server with only SBI UAT API integration',
    endpoints: {
      health: '/health',
      auth: {
        login: '/api/auth/login',
        logout: '/api/auth/logout',
        profile: '/api/auth/profile',
        verify: '/api/auth/verify',
        health: '/api/auth/health'
      },
      simpleSbi: {
        health: '/api/simple-sbi/health',
        batchId: '/api/simple-sbi/batch-id',
        records: '/api/simple-sbi/records',
        testCertificates: '/api/simple-sbi/test-certificates'
      },
      sbi: {
        health: '/api/sbi/health',
        config: '/api/sbi/config',
        batchId: '/api/sbi/batch-id',
        records: '/api/sbi/records',
        dlcData: '/api/sbi/dlc-data',
        testCertificates: '/api/sbi/test/certificates',
        testComprehensive: '/api/sbi/test/comprehensive',
        testDelhi: '/api/sbi/test/delhi'
      }
    },
    documentation: {
      batchId: 'POST /api/sbi/batch-id - Get batch ID for a state and date',
      records: 'POST /api/sbi/records - Fetch verification records',
      dlcData: 'GET /api/sbi/dlc-data - Get DLC data with filters',
      test: 'GET /api/sbi/test/comprehensive - Run comprehensive API tests'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'This server only provides SBI UAT API endpoints',
    availableEndpoints: ['/health', '/api/sbi/*'],
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
    service: 'SBI UAT API Server',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database for authentication
    console.log('🔧 Initializing database...');
    await initDatabase();
    console.log('✅ Database initialized');

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 DLC SBI UAT API Server Started');
      console.log('=' * 50);
      console.log(`📍 Server running on: http://0.0.0.0:${PORT}`);
      console.log(`📍 Local access: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log('');
      console.log('🔐 Authentication Endpoints:');
      console.log(`   Login: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`   Profile: GET http://localhost:${PORT}/api/auth/profile`);
      console.log(`   Verify: GET http://localhost:${PORT}/api/auth/verify`);
      console.log('');
      console.log('🏦 SBI UAT API Endpoints:');
      console.log(`   Health: http://localhost:${PORT}/api/sbi/health`);
      console.log(`   Config: http://localhost:${PORT}/api/sbi/config`);
      console.log(`   Batch ID: POST http://localhost:${PORT}/api/sbi/batch-id`);
      console.log(`   Records: POST http://localhost:${PORT}/api/sbi/records`);
      console.log(`   DLC Data: http://localhost:${PORT}/api/sbi/dlc-data`);
      console.log(`   Test: http://localhost:${PORT}/api/sbi/test/comprehensive`);
      console.log('');
      console.log('📋 SBI UAT Details:');
      console.log('   URL: https://eissiwebuat.sbi.bank.in:443/gen6/gateway/thirdParty/wrapper/services');
      console.log('   Source ID: DQ');
      console.log('   Destination: SPIGOV');
      console.log('   TXN_TYPE: DLC');
      console.log('=' * 50);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Node.js: ${process.version}`);
      console.log('=' * 50);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Process terminated');
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Process terminated');
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
