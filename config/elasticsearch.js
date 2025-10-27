/**
 * Elasticsearch Configuration and Connection
 * Provides connection management and index configurations for DLC data
 */

const { Client } = require('@elastic/elasticsearch');

class ElasticsearchConfig {
  constructor() {
    // Elasticsearch connection configuration
    this.config = {
      node: process.env.ELASTICSEARCH_URL || 'http://cdis.iitk.ac.in:5002',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
      },
      requestTimeout: 60000,
      pingTimeout: 10000,
      maxRetries: 5,
      resurrectStrategy: 'ping',
      ssl: {
        rejectUnauthorized: false
      }
    };

    this.client = new Client(this.config);
    this.isConnected = false;

    // Index configurations for different data types
    this.indexConfigs = {
      'dlc-excel-data': {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              dlc_text_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'trim', 'stop']
              },
              dlc_search_analyzer: {
                type: 'custom',
                tokenizer: 'keyword',
                filter: ['lowercase', 'trim']
              }
            }
          }
        },
        mappings: {
          properties: {
            // Common fields for all Excel data
            file_metadata: {
              type: 'object',
              properties: {
                file_name: { type: 'keyword' },
                file_size: { type: 'long' },
                upload_date: { type: 'date' },
                uploaded_by: { type: 'keyword' },
                sheet_name: { type: 'keyword' },
                row_number: { type: 'integer' }
              }
            },
            
            // Pensioner data fields
            ppo_number: { 
              type: 'keyword',
              fields: {
                text: { type: 'text', analyzer: 'dlc_text_analyzer' }
              }
            },
            pensioner_name: { 
              type: 'text', 
              analyzer: 'dlc_text_analyzer',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            
            // Bank details
            bank_name: { 
              type: 'text', 
              analyzer: 'dlc_text_analyzer',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            branch_name: { 
              type: 'text', 
              analyzer: 'dlc_text_analyzer',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            account_number: { type: 'keyword' },
            ifsc_code: { type: 'keyword' },
            
            // Address fields
            state: { 
              type: 'keyword',
              fields: {
                text: { type: 'text', analyzer: 'dlc_text_analyzer' }
              }
            },
            district: { 
              type: 'keyword',
              fields: {
                text: { type: 'text', analyzer: 'dlc_text_analyzer' }
              }
            },
            pincode: { type: 'keyword' },
            address: { type: 'text', analyzer: 'dlc_text_analyzer' },
            
            // Pension details
            pension_amount: { type: 'double' },
            pension_type: { type: 'keyword' },
            department: { type: 'keyword' },
            designation: { type: 'text', analyzer: 'dlc_text_analyzer' },
            
            // Dates
            date_of_birth: { type: 'date', format: 'yyyy-MM-dd||dd-MM-yyyy||dd/MM/yyyy' },
            date_of_retirement: { type: 'date', format: 'yyyy-MM-dd||dd-MM-yyyy||dd/MM/yyyy' },
            
            // Verification data
            verification_status: { type: 'keyword' },
            verification_type: { type: 'keyword' },
            verification_date: { type: 'date' },
            batch_id: { type: 'keyword' },
            
            // Contact details
            mobile_number: { type: 'keyword' },
            email: { type: 'keyword' },
            
            // Additional fields for flexible data storage
            additional_data: { 
              type: 'object',
              dynamic: true
            },
            
            // Search and filtering fields
            search_text: { 
              type: 'text', 
              analyzer: 'dlc_text_analyzer',
              store: false
            },
            
            // Timestamps
            created_at: { type: 'date' },
            updated_at: { type: 'date' }
          }
        }
      },
      
      'dlc-sbi-data': {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            state: { type: 'keyword' },
            request_date: { type: 'date' },
            batch_id: { type: 'keyword' },
            pensioner_pincode: { type: 'keyword' },
            type_of_pensioner: { type: 'keyword' },
            department: { type: 'keyword' },
            year_of_birth: { type: 'integer' },
            branch_pin: { type: 'keyword' },
            verification_type: { type: 'keyword' },
            request_reference: { type: 'keyword' },
            response_date: { type: 'date' },
            raw_response: { type: 'text', index: false },
            created_at: { type: 'date' }
          }
        }
      },
      
      'dlc-doppw-data': {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        },
        mappings: {
          properties: {
            level1: { type: 'keyword' },
            escroll_category: { type: 'keyword' },
            group_id: { type: 'keyword' },
            pension_type: { type: 'keyword' },
            branch_code: { type: 'keyword' },
            branch_name: { type: 'text', analyzer: 'dlc_text_analyzer' },
            branch_pincode: { type: 'keyword' },
            branch_state_code: { type: 'keyword' },
            branch_state_name: { type: 'keyword' },
            branch_district_code: { type: 'keyword' },
            branch_district_name: { type: 'keyword' },
            cppc_code: { type: 'keyword' },
            cppc_name: { type: 'text', analyzer: 'dlc_text_analyzer' },
            year_of_birth: { type: 'integer' },
            age: { type: 'integer' },
            submission_status: { type: 'keyword' },
            submission_mode: { type: 'keyword' },
            waiver_till: { type: 'keyword' },
            verification_type: { type: 'keyword' },
            pensioner_pincode: { type: 'keyword' },
            pensioner_district_code: { type: 'keyword' },
            pensioner_district_name: { type: 'keyword' },
            pensioner_state_code: { type: 'keyword' },
            pensioner_state_name: { type: 'keyword' },
            certificate_submission_date: { type: 'date' },
            certificate_authorization_date: { type: 'date' },
            account_number: { type: 'keyword' },
            cif_number: { type: 'keyword' },
            ppo_unique_id: { type: 'keyword' },
            data_date: { type: 'date' },
            batch_id: { type: 'keyword' },
            created_at: { type: 'date' }
          }
        }
      }
    };
  }

  /**
   * Initialize Elasticsearch connection and create indices
   */
  async initialize() {
    try {
      console.log('🔍 Connecting to Elasticsearch...');
      
      // Test connection
      const health = await this.client.cluster.health();
      console.log(`✅ Elasticsearch connected - Status: ${health.status}`);
      
      this.isConnected = true;
      
      // Create indices if they don't exist
      await this.createIndices();
      
      return { success: true, status: health.status };
    } catch (error) {
      console.error('❌ Elasticsearch connection failed:', error.message);
      this.isConnected = false;
      
      // If Elasticsearch is not available, log warning but don't crash
      console.warn('⚠️  Elasticsearch not available. Some features may be limited.');
      return { success: false, error: error.message };
    }
  }

  /**
   * Create all required indices
   */
  async createIndices() {
    for (const [indexName, config] of Object.entries(this.indexConfigs)) {
      try {
        const exists = await this.client.indices.exists({ index: indexName });
        
        if (!exists) {
          console.log(`📋 Creating index: ${indexName}`);
          await this.client.indices.create({
            index: indexName,
            body: config
          });
          console.log(`✅ Index created: ${indexName}`);
        } else {
          console.log(`📋 Index already exists: ${indexName}`);
        }
      } catch (error) {
        console.error(`❌ Error creating index ${indexName}:`, error.message);
      }
    }
  }

  /**
   * Get Elasticsearch client
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if Elasticsearch is connected
   */
  isElasticsearchConnected() {
    return this.isConnected;
  }

  /**
   * Get cluster health
   */
  async getHealth() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', error: 'Not connected to Elasticsearch' };
      }
      
      const health = await this.client.cluster.health();
      const stats = await this.client.cluster.stats();
      
      return {
        status: health.status,
        cluster_name: health.cluster_name,
        number_of_nodes: health.number_of_nodes,
        number_of_data_nodes: health.number_of_data_nodes,
        active_primary_shards: health.active_primary_shards,
        active_shards: health.active_shards,
        indices: stats.indices.count
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats() {
    try {
      if (!this.isConnected) {
        return { error: 'Not connected to Elasticsearch' };
      }
      
      const stats = {};
      
      for (const indexName of Object.keys(this.indexConfigs)) {
        try {
          const indexStats = await this.client.indices.stats({ index: indexName });
          const count = await this.client.count({ index: indexName });
          
          stats[indexName] = {
            document_count: count.count,
            size_in_bytes: indexStats.indices[indexName]?.total?.store?.size_in_bytes || 0,
            primary_shards: indexStats.indices[indexName]?.total?.segments?.count || 0
          };
        } catch (error) {
          stats[indexName] = { error: error.message };
        }
      }
      
      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Delete and recreate an index
   */
  async recreateIndex(indexName) {
    try {
      if (!this.indexConfigs[indexName]) {
        throw new Error(`Index configuration not found: ${indexName}`);
      }
      
      // Delete index if exists
      const exists = await this.client.indices.exists({ index: indexName });
      if (exists) {
        await this.client.indices.delete({ index: indexName });
        console.log(`🗑️  Deleted index: ${indexName}`);
      }
      
      // Create index
      await this.client.indices.create({
        index: indexName,
        body: this.indexConfigs[indexName]
      });
      
      console.log(`✅ Recreated index: ${indexName}`);
      return { success: true, message: `Index ${indexName} recreated successfully` };
    } catch (error) {
      console.error(`❌ Error recreating index ${indexName}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Close Elasticsearch connection
   */
  async close() {
    try {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 Elasticsearch connection closed');
    } catch (error) {
      console.error('❌ Error closing Elasticsearch connection:', error.message);
    }
  }
}

// Create singleton instance
const elasticsearchConfig = new ElasticsearchConfig();

module.exports = {
  elasticsearchConfig,
  ElasticsearchConfig
};
