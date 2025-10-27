/**
 * Data Migration Utility
 * Migrates existing SQLite data to Elasticsearch
 */

const { database } = require('../config/database');
const { elasticsearchConfig } = require('../config/elasticsearch');
const ElasticsearchDataService = require('../services/elasticsearchDataService');

class DataMigration {
  constructor() {
    this.sqliteDB = database.getDB();
    this.esClient = elasticsearchConfig.getClient();
    this.esDataService = new ElasticsearchDataService();
    
    // Table to index mappings
    this.migrationMappings = {
      'pensioner_bank_master': {
        targetIndex: 'dlc-excel-data',
        fieldMappings: {
          'id': '_id',
          'bank_name': 'bank_name',
          'branch_name': 'branch_name',
          'branch_postcode': 'pincode',
          'pensioner_city': 'district',
          'state': 'state',
          'pensioner_postcode': 'pensioner_pincode',
          'PDA': 'pda',
          'PSA': 'psa',
          'ppo_number': 'ppo_number'
        }
      },
      'TBL_DOPPW_DLCDATA_MST': {
        targetIndex: 'dlc-doppw-data',
        fieldMappings: {
          'id': '_id',
          'LEVEL1': 'level1',
          'ESCROLL_CATEGORY': 'escroll_category',
          'GROUP_ID': 'group_id',
          'PENSION_TYPE': 'pension_type',
          'BRANCH_CODE': 'branch_code',
          'BRANCH_NAME': 'branch_name',
          'BRANCH_PINCODE': 'branch_pincode',
          'BRANCH_STATE_CODE': 'branch_state_code',
          'BRANCH_STATE_NAME': 'branch_state_name',
          'BRANCH_DISTRICT_CODE': 'branch_district_code',
          'BRANCH_DISTRICT_NAME': 'branch_district_name',
          'CPPC_CODE': 'cppc_code',
          'CPPC_NAME': 'cppc_name',
          'YEAR_OF_BIRTH': 'year_of_birth',
          'AGE': 'age',
          'SUBMISSION_STATUS': 'submission_status',
          'SUBMISSION_MODE': 'submission_mode',
          'WAIVER_TILL': 'waiver_till',
          'VERIFICATION_TYPE': 'verification_type',
          'PENSIONER_PINCODE': 'pensioner_pincode',
          'PENSIONER_DISTRICT_CODE': 'pensioner_district_code',
          'PENSIONER_DISTRICT_NAME': 'pensioner_district_name',
          'PENSIONER_STATE_CODE': 'pensioner_state_code',
          'PENSIONER_STATE_NAME': 'pensioner_state_name',
          'CERTIFICATE_SUBMISSION_DATE': 'certificate_submission_date',
          'CERTIFICATE_AUTHORIZATION_DATE': 'certificate_authorization_date',
          'ACCOUNT_NUMBER': 'account_number',
          'CIF_NUMBER': 'cif_number',
          'PPO_UNIQUE_ID': 'ppo_unique_id',
          'DATA_DATE': 'data_date',
          'BATCH_ID': 'batch_id',
          'created_at': 'created_at'
        }
      },
      'sbi_verification_records': {
        targetIndex: 'dlc-sbi-data',
        fieldMappings: {
          'id': '_id',
          'state': 'state',
          'request_date': 'request_date',
          'batch_id': 'batch_id',
          'pensioner_pincode': 'pensioner_pincode',
          'type_of_pensioner': 'type_of_pensioner',
          'department': 'department',
          'year_of_birth': 'year_of_birth',
          'branch_pin': 'branch_pin',
          'verification_type': 'verification_type',
          'request_reference': 'request_reference',
          'response_date': 'response_date',
          'created_at': 'created_at'
        }
      }
    };
  }

  /**
   * Check if migration is possible
   */
  async checkMigrationReadiness() {
    try {
      // Check Elasticsearch connection
      if (!elasticsearchConfig.isElasticsearchConnected()) {
        throw new Error('Elasticsearch is not connected');
      }

      // Check SQLite database
      const tables = await this.getSQLiteTables();
      const availableTables = Object.keys(this.migrationMappings).filter(table => 
        tables.includes(table)
      );

      // Get record counts
      const tableCounts = {};
      for (const table of availableTables) {
        tableCounts[table] = await this.getTableRecordCount(table);
      }

      return {
        ready: true,
        availableTables,
        tableCounts,
        totalRecords: Object.values(tableCounts).reduce((sum, count) => sum + count, 0)
      };
    } catch (error) {
      return {
        ready: false,
        error: error.message
      };
    }
  }

  /**
   * Get SQLite table names
   */
  async getSQLiteTables() {
    return new Promise((resolve, reject) => {
      this.sqliteDB.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        }
      );
    });
  }

  /**
   * Get record count for a table
   */
  async getTableRecordCount(tableName) {
    return new Promise((resolve, reject) => {
      this.sqliteDB.get(
        `SELECT COUNT(*) as count FROM ${tableName}`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  /**
   * Migrate all data
   */
  async migrateAllData(options = {}) {
    const {
      batchSize = 1000,
      deleteExisting = false,
      onProgress = null
    } = options;

    try {
      console.log('🚀 Starting data migration from SQLite to Elasticsearch...');
      
      const readinessCheck = await this.checkMigrationReadiness();
      if (!readinessCheck.ready) {
        throw new Error(`Migration not ready: ${readinessCheck.error}`);
      }

      const results = {
        success: true,
        tables: {},
        summary: {
          totalRecords: 0,
          totalMigrated: 0,
          totalErrors: 0,
          startTime: new Date().toISOString(),
          endTime: null
        }
      };

      // Delete existing data if requested
      if (deleteExisting) {
        console.log('🗑️  Deleting existing Elasticsearch data...');
        await this.deleteExistingData();
      }

      // Migrate each table
      for (const [tableName, mapping] of Object.entries(this.migrationMappings)) {
        if (readinessCheck.availableTables.includes(tableName)) {
          console.log(`📊 Migrating table: ${tableName}`);
          
          const tableResult = await this.migrateTable(tableName, mapping, {
            batchSize,
            onProgress: (progress) => {
              if (onProgress) {
                onProgress({
                  table: tableName,
                  ...progress
                });
              }
            }
          });

          results.tables[tableName] = tableResult;
          results.summary.totalRecords += tableResult.totalRecords;
          results.summary.totalMigrated += tableResult.migrated;
          results.summary.totalErrors += tableResult.errors;
        }
      }

      results.summary.endTime = new Date().toISOString();
      console.log('✅ Data migration completed successfully');
      
      return results;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Migrate single table
   */
  async migrateTable(tableName, mapping, options = {}) {
    const { batchSize = 1000, onProgress = null } = options;
    
    try {
      const totalRecords = await this.getTableRecordCount(tableName);
      let migrated = 0;
      let errors = 0;
      let offset = 0;

      console.log(`📋 Table ${tableName}: ${totalRecords} records to migrate`);

      while (offset < totalRecords) {
        const batch = await this.getTableBatch(tableName, offset, batchSize);
        
        if (batch.length === 0) break;

        const batchResult = await this.migrateBatch(batch, mapping);
        migrated += batchResult.success;
        errors += batchResult.errors;
        offset += batchSize;

        // Progress callback
        if (onProgress) {
          onProgress({
            totalRecords,
            processed: Math.min(offset, totalRecords),
            migrated,
            errors,
            percentage: Math.round((Math.min(offset, totalRecords) / totalRecords) * 100)
          });
        }

        console.log(`📊 ${tableName}: ${Math.min(offset, totalRecords)}/${totalRecords} processed`);
      }

      return {
        tableName,
        targetIndex: mapping.targetIndex,
        totalRecords,
        migrated,
        errors,
        success: errors === 0
      };
    } catch (error) {
      console.error(`❌ Error migrating table ${tableName}:`, error);
      return {
        tableName,
        targetIndex: mapping.targetIndex,
        totalRecords: 0,
        migrated: 0,
        errors: 1,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get batch of records from SQLite table
   */
  async getTableBatch(tableName, offset, limit) {
    return new Promise((resolve, reject) => {
      this.sqliteDB.all(
        `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  /**
   * Migrate batch of records to Elasticsearch
   */
  async migrateBatch(records, mapping) {
    try {
      const bulkOps = [];
      
      for (const record of records) {
        const document = this.transformRecord(record, mapping);
        const docId = record.id || `${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        bulkOps.push({
          index: {
            _index: mapping.targetIndex,
            _id: docId
          }
        });
        bulkOps.push(document);
      }

      const result = await this.esDataService.bulkOperation(bulkOps);
      
      return {
        success: result.success ? records.length : 0,
        errors: result.success ? 0 : records.length
      };
    } catch (error) {
      console.error('Batch migration error:', error);
      return {
        success: 0,
        errors: records.length
      };
    }
  }

  /**
   * Transform SQLite record to Elasticsearch document
   */
  transformRecord(record, mapping) {
    const document = {
      file_metadata: {
        file_name: 'migrated_from_sqlite',
        upload_date: new Date().toISOString(),
        uploaded_by: 'system_migration',
        migration_source: 'sqlite'
      },
      created_at: record.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Map fields according to mapping configuration
    Object.entries(mapping.fieldMappings).forEach(([sourceField, targetField]) => {
      if (targetField !== '_id' && record[sourceField] !== undefined) {
        document[targetField] = this.convertValue(targetField, record[sourceField]);
      }
    });

    // Add unmapped fields to additional_data
    const mappedSources = new Set(Object.keys(mapping.fieldMappings));
    const additionalData = {};
    
    Object.keys(record).forEach(key => {
      if (!mappedSources.has(key) && record[key] !== null && record[key] !== undefined) {
        additionalData[key] = record[key];
      }
    });

    if (Object.keys(additionalData).length > 0) {
      document.additional_data = additionalData;
    }

    // Create search text
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
   * Convert value to appropriate type
   */
  convertValue(fieldName, value) {
    if (value === null || value === undefined) return null;
    
    // Date fields
    if (fieldName.includes('date') || fieldName.includes('_at')) {
      if (typeof value === 'string' && value.trim() !== '') {
        try {
          return new Date(value).toISOString();
        } catch {
          return value;
        }
      }
      return value;
    }
    
    // Numeric fields
    if (fieldName.includes('amount') || fieldName.includes('age') || 
        fieldName.includes('year') || fieldName === 'pension_amount') {
      const numValue = parseFloat(value);
      return isNaN(numValue) ? null : numValue;
    }
    
    return value;
  }

  /**
   * Delete existing Elasticsearch data
   */
  async deleteExistingData() {
    const indices = [...new Set(Object.values(this.migrationMappings).map(m => m.targetIndex))];
    
    for (const index of indices) {
      try {
        await this.esDataService.deleteByQuery(index, '', {});
        console.log(`🗑️  Cleared index: ${index}`);
      } catch (error) {
        console.warn(`⚠️  Could not clear index ${index}:`, error.message);
      }
    }
  }

  /**
   * Verify migration results
   */
  async verifyMigration() {
    try {
      const verification = {
        success: true,
        indices: {},
        summary: {
          totalSQLiteRecords: 0,
          totalElasticsearchRecords: 0,
          match: false
        }
      };

      // Check each mapping
      for (const [tableName, mapping] of Object.entries(this.migrationMappings)) {
        try {
          const sqliteCount = await this.getTableRecordCount(tableName);
          const esResponse = await this.esClient.count({ index: mapping.targetIndex });
          const esCount = esResponse.count;

          verification.indices[tableName] = {
            targetIndex: mapping.targetIndex,
            sqliteRecords: sqliteCount,
            elasticsearchRecords: esCount,
            match: sqliteCount === esCount
          };

          verification.summary.totalSQLiteRecords += sqliteCount;
          verification.summary.totalElasticsearchRecords += esCount;
        } catch (error) {
          verification.indices[tableName] = {
            error: error.message
          };
          verification.success = false;
        }
      }

      verification.summary.match = 
        verification.summary.totalSQLiteRecords === verification.summary.totalElasticsearchRecords;

      return verification;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = DataMigration;
