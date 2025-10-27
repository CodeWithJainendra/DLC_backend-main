/**
 * Excel Analysis and Auto-Insert Routes
 * Handles Excel file upload, analysis, and automatic database insertion
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const ExcelAnalyzer = require('../utils/excelAnalyzer');
const ElasticsearchExcelAnalyzer = require('../utils/elasticsearchExcelAnalyzer');
const ElasticsearchDataService = require('../services/elasticsearchDataService');
const { elasticsearchConfig } = require('../config/elasticsearch');
const dataAccess = require('../middleware/dataAccess');

const router = express.Router();

// Initialize Elasticsearch services
const esAnalyzer = new ElasticsearchExcelAnalyzer();
const esDataService = new ElasticsearchDataService();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../EXCEL_DATA');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

/**
 * @route POST /api/excel/analyze-and-insert-es
 * @desc Upload Excel file, analyze structure, and save to Elasticsearch (preferred method)
 * @access Private (requires authentication)
 */
router.post('/analyze-and-insert-es', 
  ...dataAccess.protectDLCRoute,
  upload.single('excelFile'),
  async (req, res) => {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      filePath = req.file.path;
      console.log(`📊 Processing Excel file with Elasticsearch: ${req.file.originalname}`);

      // Check if Elasticsearch is available
      if (!esDataService.isElasticsearchAvailable()) {
        console.warn('⚠️  Elasticsearch not available, falling back to SQLite method');
        // Redirect to SQLite method
        req.url = '/analyze-and-insert';
        return router.handle(req, res);
      }

      // Step 1: Analyze file structure with Elasticsearch
      console.log('🔍 Step 1: Analyzing file structure with Elasticsearch...');
      const analysisResult = await esAnalyzer.analyzeFile(filePath);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Step 2: Save to Elasticsearch
      console.log('💾 Step 2: Saving data to Elasticsearch...');
      const uploadMetadata = {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.user?.id || 'anonymous'
      };

      const saveResult = await esAnalyzer.saveToElasticsearch(analysisResult.data, uploadMetadata);

      // Step 3: Generate preview data
      console.log('👁️ Step 3: Generating preview...');
      const previewData = [];
      for (const sheet of analysisResult.data.sheets) {
        const preview = sheet.data.slice(0, 10).map(row => ({
          sheet: sheet.name,
          detectedType: sheet.detectedType?.type || 'unknown',
          confidence: sheet.detectedType?.confidence || 0,
          ...row
        }));
        previewData.push(...preview);
      }

      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Return comprehensive results
      res.json({
        success: true,
        message: 'File processed and saved to Elasticsearch successfully',
        method: 'elasticsearch',
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          totalRecords: analysisResult.totalRecords,
          sheetsProcessed: analysisResult.data.sheets.length,
          saveResults: saveResult.results,
          summary: saveResult.summary,
          preview: previewData,
          elasticsearch: {
            indices_used: saveResult.results.map(r => r.index),
            total_saved: saveResult.summary.totalSaved,
            total_errors: saveResult.summary.totalErrors
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Elasticsearch Excel processing error:', error);
      
      // Clean up uploaded file on error
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(500).json({
        success: false,
        method: 'elasticsearch',
        error: error.message || 'Failed to process Excel file with Elasticsearch',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route POST /api/excel/analyze-and-insert
 * @desc Upload Excel file, analyze structure, and auto-insert into DLC database (SQLite fallback)
 * @access Private (requires authentication)
 */
router.post('/analyze-and-insert', 
  ...dataAccess.protectDLCRoute,
  upload.single('excelFile'),
  async (req, res) => {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      filePath = req.file.path;
      console.log(`📊 Processing Excel file: ${req.file.originalname}`);

      // Initialize Excel analyzer
      const analyzer = new ExcelAnalyzer();
      
      // Step 1: Analyze file structure
      console.log('🔍 Step 1: Analyzing file structure...');
      const analysisResult = await analyzer.analyzeFile(filePath);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Step 2: Auto-detect target tables and mappings
      console.log('🎯 Step 2: Detecting target tables...');
      const mappingResult = await analyzer.detectTableMappings(analysisResult.data);
      
      // Step 3: Insert data into database
      console.log('💾 Step 3: Inserting data into database...');
      const insertionResult = await analyzer.insertDataToDatabase(mappingResult);

      // Step 4: Generate preview data
      console.log('👁️ Step 4: Generating preview...');
      const previewData = await analyzer.generatePreview(analysisResult.data);

      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Return comprehensive results
      res.json({
        success: true,
        message: 'File processed successfully (SQLite method)',
        method: 'sqlite',
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          totalRecords: analysisResult.totalRecords,
          detectedTables: mappingResult.detectedTables.length,
          tableMappings: mappingResult.detectedTables,
          insertionResults: insertionResult.results,
          preview: previewData.slice(0, 10), // First 10 records for preview
          summary: {
            totalInserted: insertionResult.totalInserted,
            totalSkipped: insertionResult.totalSkipped,
            errors: insertionResult.errors
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Excel processing error:', error);
      
      // Clean up uploaded file on error
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process Excel file',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/excel/supported-tables
 * @desc Get list of supported database tables for mapping
 * @access Private
 */
router.get('/supported-tables', 
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      const analyzer = new ExcelAnalyzer();
      const supportedTables = analyzer.getSupportedTables();

      res.json({
        success: true,
        data: supportedTables,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting supported tables:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/excel/preview
 * @desc Upload and preview Excel file without inserting data
 * @access Private
 */
router.post('/preview',
  ...dataAccess.protectDLCRoute,
  upload.single('excelFile'),
  async (req, res) => {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      filePath = req.file.path;
      const analyzer = new ExcelAnalyzer();
      
      // Analyze file structure only
      const analysisResult = await analyzer.analyzeFile(filePath);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Generate preview without insertion
      const previewData = await analyzer.generatePreview(analysisResult.data);
      const mappingResult = await analyzer.detectTableMappings(analysisResult.data);

      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({
        success: true,
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          totalRecords: analysisResult.totalRecords,
          sheets: analysisResult.data.sheets,
          detectedTables: mappingResult.detectedTables,
          preview: previewData.slice(0, 20), // First 20 records
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Preview error:', error);
      
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/excel/upload-history
 * @desc Get history of uploaded files and their processing results
 * @access Private
 */
router.get('/upload-history',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      const { database } = require('../config/database');
      const db = database.getDB();

      // Get upload history from database (you may need to create this table)
      const query = `
        SELECT 
          id,
          file_name,
          file_size,
          total_records,
          tables_detected,
          records_inserted,
          upload_date,
          status,
          uploaded_by
        FROM excel_upload_history 
        WHERE uploaded_by = ?
        ORDER BY upload_date DESC 
        LIMIT 50
      `;

      const history = await new Promise((resolve, reject) => {
        db.all(query, [req.user.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      res.json({
        success: true,
        data: history,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting upload history:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/excel/database-stats
 * @desc Get current database statistics after uploads
 * @access Private
 */
router.get('/database-stats',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      const analyzer = new ExcelAnalyzer();
      const stats = await analyzer.getDatabaseStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting database stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
