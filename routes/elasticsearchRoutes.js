/**
 * Elasticsearch Routes
 * Advanced search and filtering routes using Elasticsearch
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ElasticsearchExcelAnalyzer = require('../utils/elasticsearchExcelAnalyzer');
const ElasticsearchDataService = require('../services/elasticsearchDataService');
const { elasticsearchConfig } = require('../config/elasticsearch');
const dataAccess = require('../middleware/dataAccess');

const router = express.Router();

// Initialize services
const esAnalyzer = new ElasticsearchExcelAnalyzer();
const esDataService = new ElasticsearchDataService();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/elasticsearch');
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
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
 * @route GET /api/elasticsearch/health
 * @desc Check Elasticsearch health and connection status
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = await elasticsearchConfig.getHealth();
    const indexStats = await elasticsearchConfig.getIndexStats();
    const serviceHealth = await esDataService.getIndexHealth();

    res.json({
      success: true,
      elasticsearch: {
        connected: elasticsearchConfig.isElasticsearchConnected(),
        cluster: health,
        indices: indexStats,
        serviceStatus: serviceHealth
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
 * @route POST /api/elasticsearch/upload-excel
 * @desc Upload Excel file and save to Elasticsearch
 * @access Private
 */
router.post('/upload-excel',
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

      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      filePath = req.file.path;
      console.log(`📊 Processing Excel file with Elasticsearch: ${req.file.originalname}`);

      // Step 1: Analyze file structure
      const analysisResult = await esAnalyzer.analyzeFile(filePath);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Step 2: Save to Elasticsearch
      const uploadMetadata = {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.user?.id || 'anonymous'
      };

      const saveResult = await esAnalyzer.saveToElasticsearch(analysisResult.data, uploadMetadata);

      // Step 3: Generate preview
      const previewData = [];
      for (const sheet of analysisResult.data.sheets) {
        const preview = sheet.data.slice(0, 5).map(row => ({
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

      res.json({
        success: true,
        message: 'File processed and saved to Elasticsearch successfully',
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          totalRecords: analysisResult.totalRecords,
          sheetsProcessed: analysisResult.data.sheets.length,
          saveResults: saveResult.results,
          summary: saveResult.summary,
          preview: previewData,
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
        error: error.message || 'Failed to process Excel file',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/elasticsearch/search
 * @desc Advanced search with filters and aggregations
 * @access Private
 */
router.get('/search',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const {
        q = '',
        index = 'dlc-excel-data',
        state,
        district,
        bank_name,
        pension_type,
        department,
        verification_status,
        date_from,
        date_to,
        pension_amount_min,
        pension_amount_max,
        page = 1,
        size = 20,
        sort_field = 'created_at',
        sort_order = 'desc',
        include_aggregations = 'true'
      } = req.query;

      // Build filters
      const filters = {};
      if (state) filters.state = state;
      if (district) filters.district = district;
      if (bank_name) filters['bank_name.keyword'] = bank_name;
      if (pension_type) filters.pension_type = pension_type;
      if (department) filters.department = department;
      if (verification_status) filters.verification_status = verification_status;

      // Date range filter
      if (date_from || date_to) {
        const dateRange = {};
        if (date_from) dateRange.gte = date_from;
        if (date_to) dateRange.lte = date_to;
        filters['file_metadata.upload_date'] = { range: dateRange };
      }

      // Pension amount range filter
      if (pension_amount_min || pension_amount_max) {
        const amountRange = {};
        if (pension_amount_min) amountRange.gte = parseFloat(pension_amount_min);
        if (pension_amount_max) amountRange.lte = parseFloat(pension_amount_max);
        filters.pension_amount = { range: amountRange };
      }

      // Search options
      const searchOptions = {
        index,
        query: q,
        filters,
        size: parseInt(size),
        from: (parseInt(page) - 1) * parseInt(size),
        sort: [{ [sort_field]: { order: sort_order } }],
        includeAggregations: include_aggregations === 'true'
      };

      const result = await esDataService.search(searchOptions);

      res.json({
        success: result.success,
        query: q,
        filters,
        pagination: {
          page: parseInt(page),
          size: parseInt(size),
          total: result.total,
          pages: Math.ceil(result.total / parseInt(size))
        },
        data: result.data || [],
        aggregations: result.aggregations || {},
        took: result.took,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/elasticsearch/suggestions
 * @desc Get autocomplete suggestions for a field
 * @access Private
 */
router.get('/suggestions',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const { field, query, size = 10 } = req.query;

      if (!field || !query) {
        return res.status(400).json({
          success: false,
          error: 'Field and query parameters are required'
        });
      }

      const result = await esDataService.getSuggestions(field, query, parseInt(size));

      res.json({
        success: result.success,
        field,
        query,
        suggestions: result.suggestions || [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Suggestions error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/elasticsearch/statistics
 * @desc Get comprehensive statistics and dashboard data
 * @access Private
 */
router.get('/statistics',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const { index = 'dlc-excel-data' } = req.query;

      const result = await esDataService.getStatistics(index);

      res.json({
        success: result.success,
        index,
        statistics: result.statistics || {},
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Statistics error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/elasticsearch/export
 * @desc Export filtered data
 * @access Private
 */
router.get('/export',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const {
        q = '',
        index = 'dlc-excel-data',
        format = 'json',
        fields,
        max_size = 10000,
        ...filterParams
      } = req.query;

      // Build filters from query parameters
      const filters = {};
      Object.entries(filterParams).forEach(([key, value]) => {
        if (value && !['q', 'index', 'format', 'fields', 'max_size'].includes(key)) {
          filters[key] = value;
        }
      });

      const exportOptions = {
        index,
        query: q,
        filters,
        format,
        maxSize: parseInt(max_size)
      };

      if (fields) {
        exportOptions.fields = fields.split(',').map(f => f.trim());
      }

      const result = await esDataService.exportData(exportOptions);

      if (!result.success) {
        return res.status(500).json(result);
      }

      // Set appropriate headers for download
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `dlc_export_${timestamp}.${format}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');

      if (format === 'json') {
        res.json({
          success: true,
          exported: result.exported,
          total: result.total,
          data: result.data,
          timestamp: new Date().toISOString()
        });
      } else {
        // Convert to CSV format
        const csvData = this.convertToCSV(result.data);
        res.send(csvData);
      }

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route GET /api/elasticsearch/document/:id
 * @desc Get specific document by ID
 * @access Private
 */
router.get('/document/:id',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const { id } = req.params;
      const { index = 'dlc-excel-data' } = req.query;

      const result = await esDataService.getDocument(index, id);

      res.json({
        success: result.success,
        data: result.data || null,
        error: result.error || null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route PUT /api/elasticsearch/document/:id
 * @desc Update specific document
 * @access Private
 */
router.put('/document/:id',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const { id } = req.params;
      const { index = 'dlc-excel-data' } = req.query;
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No update data provided'
        });
      }

      const result = await esDataService.updateDocument(index, id, updates);

      res.json({
        success: result.success,
        id: result.id,
        version: result.version,
        result: result.result,
        error: result.error || null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Update document error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route DELETE /api/elasticsearch/document/:id
 * @desc Delete specific document
 * @access Private
 */
router.delete('/document/:id',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      if (!esDataService.isElasticsearchAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Elasticsearch is not available'
        });
      }

      const { id } = req.params;
      const { index = 'dlc-excel-data' } = req.query;

      const result = await esDataService.deleteDocument(index, id);

      res.json({
        success: result.success,
        result: result.result,
        error: result.error || null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Delete document error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route POST /api/elasticsearch/reindex
 * @desc Recreate index (admin only)
 * @access Private
 */
router.post('/reindex',
  ...dataAccess.protectDLCRoute,
  async (req, res) => {
    try {
      const { index } = req.body;

      if (!index) {
        return res.status(400).json({
          success: false,
          error: 'Index name is required'
        });
      }

      const result = await elasticsearchConfig.recreateIndex(index);

      res.json({
        success: result.success,
        message: result.message,
        error: result.error || null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Reindex error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * Helper function to convert data to CSV
 */
function convertToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

module.exports = router;
