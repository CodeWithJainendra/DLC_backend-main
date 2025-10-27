/**
 * Elasticsearch Excel Analyzer
 * Analyzes Excel files and saves data to Elasticsearch with advanced search capabilities
 */

const XLSX = require('xlsx');
const path = require('path');
const { elasticsearchConfig } = require('../config/elasticsearch');

class ElasticsearchExcelAnalyzer {
  constructor() {
    this.esClient = elasticsearchConfig.getClient();
    this.isESConnected = elasticsearchConfig.isElasticsearchConnected();
    
    // Enhanced data type detection patterns
    this.dataPatterns = {
      pensioner: {
        priority: 1,
        index: 'dlc-excel-data',
        patterns: ['ppo', 'pensioner', 'pension', 'name', 'bank', 'account'],
        requiredFields: ['ppo_number', 'pensioner_name'],
        fieldMappings: {
          // PPO patterns
          'ppo_number': ['ppo', 'ppo_no', 'ppo_number', 'pension_payment_order', 'pponumber'],
          'pensioner_name': ['name', 'pensioner_name', 'pensioner', 'full_name', 'employee_name'],
          
          // Bank details
          'bank_name': ['bank', 'bank_name', 'bankname', 'bank_branch'],
          'branch_name': ['branch', 'branch_name', 'branchname'],
          'account_number': ['account', 'account_no', 'account_number', 'acc_no', 'accno'],
          'ifsc_code': ['ifsc', 'ifsc_code', 'ifsccode', 'bank_code'],
          
          // Address
          'state': ['state', 'state_name', 'statename', 'state_code'],
          'district': ['district', 'district_name', 'districtname', 'dist'],
          'pincode': ['pin', 'pincode', 'pin_code', 'postal_code', 'zipcode'],
          'address': ['address', 'full_address', 'residential_address'],
          
          // Pension details
          'pension_amount': ['amount', 'pension_amount', 'basic_pension', 'pension'],
          'pension_type': ['type', 'pension_type', 'category'],
          'department': ['dept', 'department', 'ministry', 'organization'],
          'designation': ['designation', 'post', 'position', 'rank'],
          
          // Dates
          'date_of_birth': ['dob', 'date_of_birth', 'birth_date', 'dateofbirth'],
          'date_of_retirement': ['dor', 'date_of_retirement', 'retirement_date', 'dateofretirement'],
          
          // Contact
          'mobile_number': ['mobile', 'phone', 'contact', 'mobile_no', 'cell'],
          'email': ['email', 'email_id', 'mail', 'e_mail']
        }
      },
      
      verification: {
        priority: 2,
        index: 'dlc-sbi-data',
        patterns: ['verification', 'status', 'sbi', 'batch', 'response'],
        requiredFields: ['ppo_number', 'verification_status'],
        fieldMappings: {
          'ppo_number': ['ppo', 'ppo_no', 'ppo_number'],
          'verification_status': ['status', 'verification_status', 'verification'],
          'verification_type': ['type', 'verification_type', 'ver_type'],
          'verification_date': ['date', 'verification_date', 'ver_date'],
          'batch_id': ['batch', 'batch_id', 'batchid'],
          'state': ['state', 'state_name'],
          'request_date': ['request_date', 'req_date'],
          'response_date': ['response_date', 'resp_date']
        }
      },
      
      doppw: {
        priority: 3,
        index: 'dlc-doppw-data',
        patterns: ['doppw', 'escroll', 'cppc', 'submission', 'certificate'],
        requiredFields: ['ppo_unique_id'],
        fieldMappings: {
          'ppo_unique_id': ['ppo_unique_id', 'ppo_id', 'unique_id'],
          'level1': ['level1', 'level_1'],
          'escroll_category': ['escroll', 'escroll_category', 'category'],
          'group_id': ['group', 'group_id', 'groupid'],
          'pension_type': ['pension_type', 'type'],
          'branch_code': ['branch_code', 'branch'],
          'submission_status': ['submission_status', 'status'],
          'verification_type': ['verification_type', 'ver_type'],
          'age': ['age', 'current_age'],
          'year_of_birth': ['yob', 'year_of_birth', 'birth_year']
        }
      }
    };
  }

  /**
   * Analyze Excel file and determine data structure
   */
  async analyzeFile(filePath) {
    try {
      console.log(`📊 Analyzing Excel file with Elasticsearch: ${filePath}`);
      
      if (!this.isESConnected) {
        console.warn('⚠️  Elasticsearch not connected, falling back to basic analysis');
      }
      
      const workbook = XLSX.readFile(filePath);
      const sheetNames = workbook.SheetNames;
      
      let totalRecords = 0;
      const sheets = [];

      for (const sheetName of sheetNames) {
        console.log(`📋 Processing sheet: ${sheetName}`);
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: null,
          blankrows: false
        });

        if (jsonData.length === 0) continue;

        // Smart header detection
        const headerInfo = this.detectHeaders(jsonData);
        if (!headerInfo.headers.length) continue;

        // Convert to structured data
        const dataRows = jsonData.slice(headerInfo.headerRow + 1)
          .filter(row => row && row.some(cell => cell !== null && cell !== ''));

        const sheetData = dataRows.map((row, index) => {
          const obj = {
            _row_number: headerInfo.headerRow + index + 2, // Excel row number
            _sheet_name: sheetName
          };
          
          headerInfo.headers.forEach((header, colIndex) => {
            if (header) {
              obj[header] = this.cleanCellValue(row[colIndex]);
            }
          });
          
          return obj;
        });

        totalRecords += sheetData.length;

        sheets.push({
          name: sheetName,
          headers: headerInfo.headers.filter(h => h),
          data: sheetData,
          recordCount: sheetData.length,
          sampleData: sheetData.slice(0, 5),
          detectedType: this.detectDataType(headerInfo.headers)
        });
      }

      return {
        success: true,
        totalRecords,
        data: {
          fileName: path.basename(filePath),
          sheets,
          totalSheets: sheets.length
        }
      };

    } catch (error) {
      console.error('❌ Excel analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect headers with improved logic
   */
  detectHeaders(jsonData) {
    let bestHeaderRow = 0;
    let bestHeaders = [];
    let maxScore = 0;

    // Check first 5 rows for potential headers
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const headers = row.map(cell => this.normalizeColumnName(cell));
      const score = this.scoreHeaderRow(headers);

      if (score > maxScore) {
        maxScore = score;
        bestHeaderRow = i;
        bestHeaders = headers;
      }
    }

    return {
      headerRow: bestHeaderRow,
      headers: bestHeaders,
      score: maxScore
    };
  }

  /**
   * Score header row quality
   */
  scoreHeaderRow(headers) {
    let score = 0;
    const validHeaders = headers.filter(h => h && h.length > 0);
    
    // Base score for number of valid headers
    score += validHeaders.length * 10;
    
    // Bonus for recognizable patterns
    validHeaders.forEach(header => {
      const lower = header.toLowerCase();
      
      // Check against known field patterns
      Object.values(this.dataPatterns).forEach(pattern => {
        Object.values(pattern.fieldMappings).forEach(mappings => {
          if (mappings.some(mapping => lower.includes(mapping))) {
            score += 20;
          }
        });
      });
      
      // Bonus for common data indicators
      if (lower.includes('name') || lower.includes('number') || 
          lower.includes('code') || lower.includes('date')) {
        score += 5;
      }
    });

    return score;
  }

  /**
   * Detect data type based on headers
   */
  detectDataType(headers) {
    const headerText = headers.join(' ').toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    Object.entries(this.dataPatterns).forEach(([type, config]) => {
      let score = 0;
      
      // Check pattern matches
      config.patterns.forEach(pattern => {
        if (headerText.includes(pattern)) {
          score += 10;
        }
      });
      
      // Check required field matches
      config.requiredFields.forEach(field => {
        const mappings = config.fieldMappings[field] || [];
        if (mappings.some(mapping => headerText.includes(mapping))) {
          score += 20;
        }
      });

      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          type,
          config,
          confidence: score
        };
      }
    });

    return bestMatch;
  }

  /**
   * Save data to Elasticsearch
   */
  async saveToElasticsearch(analysisData, uploadMetadata = {}) {
    if (!this.isESConnected) {
      throw new Error('Elasticsearch is not connected');
    }

    const results = [];
    let totalSaved = 0;
    let totalErrors = 0;

    for (const sheet of analysisData.sheets) {
      console.log(`💾 Saving sheet to Elasticsearch: ${sheet.name}`);
      
      try {
        const sheetResult = await this.saveSheetData(sheet, uploadMetadata);
        results.push(sheetResult);
        totalSaved += sheetResult.saved || 0;
        totalErrors += sheetResult.errors || 0;
      } catch (error) {
        console.error(`❌ Error saving sheet ${sheet.name}:`, error);
        results.push({
          sheetName: sheet.name,
          success: false,
          error: error.message,
          saved: 0,
          errors: sheet.recordCount
        });
        totalErrors += sheet.recordCount;
      }
    }

    return {
      success: totalErrors === 0,
      results,
      summary: {
        totalSaved,
        totalErrors,
        sheetsProcessed: results.length
      }
    };
  }

  /**
   * Save individual sheet data
   */
  async saveSheetData(sheet, uploadMetadata) {
    const { detectedType } = sheet;
    
    if (!detectedType) {
      throw new Error(`Could not determine data type for sheet: ${sheet.name}`);
    }

    const index = detectedType.config.index;
    const fieldMappings = detectedType.config.fieldMappings;
    
    // Prepare bulk operations
    const bulkOps = [];
    let saved = 0;
    let errors = 0;

    for (const row of sheet.data) {
      try {
        const document = this.transformRowToDocument(row, fieldMappings, uploadMetadata, sheet.name);
        
        // Add bulk index operation
        bulkOps.push({
          index: {
            _index: index,
            _id: this.generateDocumentId(document, sheet.name)
          }
        });
        bulkOps.push(document);
        
      } catch (error) {
        console.error('Row transformation error:', error);
        errors++;
      }
    }

    // Execute bulk operation
    if (bulkOps.length > 0) {
      try {
        const response = await this.esClient.bulk({
          refresh: true,
          body: bulkOps
        });

        // Count successful operations
        response.items.forEach(item => {
          if (item.index && !item.index.error) {
            saved++;
          } else {
            errors++;
            if (item.index?.error) {
              console.error('Bulk index error:', item.index.error);
            }
          }
        });

      } catch (bulkError) {
        console.error('Bulk operation error:', bulkError);
        errors += bulkOps.length / 2; // Each document has 2 bulk operations
      }
    }

    return {
      sheetName: sheet.name,
      success: errors === 0,
      index,
      dataType: detectedType.type,
      confidence: detectedType.confidence,
      saved,
      errors,
      totalRecords: sheet.recordCount
    };
  }

  /**
   * Transform row data to Elasticsearch document
   */
  transformRowToDocument(row, fieldMappings, uploadMetadata, sheetName) {
    const document = {
      file_metadata: {
        file_name: uploadMetadata.fileName || 'unknown',
        file_size: uploadMetadata.fileSize || 0,
        upload_date: new Date().toISOString(),
        uploaded_by: uploadMetadata.uploadedBy || 'system',
        sheet_name: sheetName,
        row_number: row._row_number || 0
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Map fields based on detected mappings
    Object.entries(fieldMappings).forEach(([targetField, sourceMappings]) => {
      const sourceField = this.findMatchingField(row, sourceMappings);
      if (sourceField && row[sourceField] !== null && row[sourceField] !== '') {
        document[targetField] = this.convertFieldValue(targetField, row[sourceField]);
      }
    });

    // Add unmapped fields to additional_data
    const mappedSources = new Set();
    Object.values(fieldMappings).forEach(mappings => {
      mappings.forEach(mapping => {
        const found = this.findMatchingField(row, [mapping]);
        if (found) mappedSources.add(found);
      });
    });

    const additionalData = {};
    Object.keys(row).forEach(key => {
      if (!mappedSources.has(key) && !key.startsWith('_') && 
          row[key] !== null && row[key] !== '') {
        additionalData[key] = row[key];
      }
    });

    if (Object.keys(additionalData).length > 0) {
      document.additional_data = additionalData;
    }

    // Create search text for full-text search
    const searchableValues = [];
    Object.values(document).forEach(value => {
      if (typeof value === 'string' && value.length > 0) {
        searchableValues.push(value);
      }
    });
    document.search_text = searchableValues.join(' ');

    return document;
  }

  /**
   * Find matching field in row data
   */
  findMatchingField(row, sourceMappings) {
    const rowKeys = Object.keys(row).map(k => k.toLowerCase());
    
    for (const mapping of sourceMappings) {
      const mappingLower = mapping.toLowerCase();
      
      // Exact match
      const exactMatch = rowKeys.find(key => key === mappingLower);
      if (exactMatch) {
        return Object.keys(row)[rowKeys.indexOf(exactMatch)];
      }
      
      // Partial match
      const partialMatch = rowKeys.find(key => 
        key.includes(mappingLower) || mappingLower.includes(key)
      );
      if (partialMatch) {
        return Object.keys(row)[rowKeys.indexOf(partialMatch)];
      }
    }
    
    return null;
  }

  /**
   * Convert field value to appropriate type
   */
  convertFieldValue(fieldName, value) {
    if (value === null || value === '') return null;
    
    const stringValue = String(value).trim();
    
    // Date fields
    if (fieldName.includes('date') || fieldName.includes('_at')) {
      return this.parseDate(stringValue);
    }
    
    // Numeric fields
    if (fieldName.includes('amount') || fieldName.includes('age') || 
        fieldName.includes('year') || fieldName === 'pension_amount') {
      const numValue = parseFloat(stringValue.replace(/[^\d.-]/g, ''));
      return isNaN(numValue) ? null : numValue;
    }
    
    // Clean string values
    return stringValue;
  }

  /**
   * Parse date from various formats
   */
  parseDate(dateString) {
    if (!dateString) return null;
    
    try {
      // Try various date formats
      const formats = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
        /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
        /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
      ];
      
      let parsedDate = null;
      
      if (formats[0].test(dateString)) {
        parsedDate = new Date(dateString);
      } else if (formats[1].test(dateString)) {
        const [day, month, year] = dateString.split('-');
        parsedDate = new Date(`${year}-${month}-${day}`);
      } else if (formats[2].test(dateString)) {
        const [day, month, year] = dateString.split('/');
        parsedDate = new Date(`${year}-${month}-${day}`);
      } else if (formats[3].test(dateString)) {
        parsedDate = new Date(dateString.replace(/\//g, '-'));
      } else {
        parsedDate = new Date(dateString);
      }
      
      return parsedDate.toISOString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate unique document ID
   */
  generateDocumentId(document, sheetName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileId = document.file_metadata?.file_name?.replace(/[^a-zA-Z0-9]/g, '') || 'unknown';
    const rowNum = document.file_metadata?.row_number || 0;
    
    return `${fileId}_${sheetName}_${rowNum}_${timestamp}_${random}`;
  }

  /**
   * Clean cell value
   */
  cleanCellValue(value) {
    if (value === null || value === undefined) return null;
    
    const stringValue = String(value).trim();
    if (stringValue === '' || stringValue.toLowerCase() === 'null') return null;
    
    return stringValue;
  }

  /**
   * Normalize column names
   */
  normalizeColumnName(name) {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Search data in Elasticsearch
   */
  async searchData(query, filters = {}, options = {}) {
    if (!this.isESConnected) {
      throw new Error('Elasticsearch is not connected');
    }

    const {
      index = 'dlc-excel-data',
      size = 20,
      from = 0,
      sort = [{ created_at: { order: 'desc' } }]
    } = options;

    const searchBody = {
      query: this.buildSearchQuery(query, filters),
      size,
      from,
      sort,
      highlight: {
        fields: {
          search_text: {},
          pensioner_name: {},
          ppo_number: {}
        }
      }
    };

    try {
      const response = await this.esClient.search({
        index,
        body: searchBody
      });

      return {
        success: true,
        total: response.hits.total.value,
        data: response.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          ...hit._source,
          highlights: hit.highlight
        })),
        aggregations: response.aggregations
      };
    } catch (error) {
      console.error('Search error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build Elasticsearch query
   */
  buildSearchQuery(query, filters) {
    const must = [];
    const filter = [];

    // Text search
    if (query && query.trim()) {
      must.push({
        multi_match: {
          query: query.trim(),
          fields: [
            'search_text^2',
            'pensioner_name^3',
            'ppo_number^3',
            'bank_name^2',
            'state',
            'district'
          ],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }

    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== '') {
        if (Array.isArray(value)) {
          filter.push({ terms: { [field]: value } });
        } else {
          filter.push({ term: { [field]: value } });
        }
      }
    });

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter
      }
    };
  }

  /**
   * Get aggregations for filtering
   */
  async getAggregations(index = 'dlc-excel-data') {
    if (!this.isESConnected) {
      throw new Error('Elasticsearch is not connected');
    }

    try {
      const response = await this.esClient.search({
        index,
        size: 0,
        body: {
          aggs: {
            states: {
              terms: { field: 'state', size: 50 }
            },
            districts: {
              terms: { field: 'district', size: 100 }
            },
            banks: {
              terms: { field: 'bank_name.keyword', size: 50 }
            },
            pension_types: {
              terms: { field: 'pension_type', size: 20 }
            },
            departments: {
              terms: { field: 'department', size: 30 }
            },
            upload_dates: {
              date_histogram: {
                field: 'file_metadata.upload_date',
                calendar_interval: 'day'
              }
            }
          }
        }
      });

      return {
        success: true,
        aggregations: response.aggregations
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ElasticsearchExcelAnalyzer;
