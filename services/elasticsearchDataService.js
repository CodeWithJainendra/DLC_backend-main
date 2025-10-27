/**
 * Elasticsearch Data Service
 * Provides comprehensive CRUD operations and advanced search capabilities
 */

const { elasticsearchConfig } = require('../config/elasticsearch');

class ElasticsearchDataService {
  constructor() {
    this.esClient = elasticsearchConfig.getClient();
    this.isConnected = elasticsearchConfig.isElasticsearchConnected();
    
    // Default indices
    this.indices = {
      excel: 'dlc-excel-data',
      sbi: 'dlc-sbi-data',
      doppw: 'dlc-doppw-data'
    };
  }

  /**
   * Check if Elasticsearch is available
   */
  isElasticsearchAvailable() {
    return this.isConnected;
  }

  /**
   * Create a new document
   */
  async createDocument(index, document, id = null) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const params = {
        index,
        body: {
          ...document,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };

      if (id) {
        params.id = id;
      }

      const response = await this.esClient.index(params);
      
      return {
        success: true,
        id: response._id,
        version: response._version,
        result: response.result
      };
    } catch (error) {
      console.error('Create document error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(index, id) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.get({
        index,
        id
      });

      return {
        success: true,
        data: {
          id: response._id,
          version: response._version,
          ...response._source
        }
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return {
          success: false,
          error: 'Document not found'
        };
      }
      
      console.error('Get document error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update document
   */
  async updateDocument(index, id, updates) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.update({
        index,
        id,
        body: {
          doc: {
            ...updates,
            updated_at: new Date().toISOString()
          }
        }
      });

      return {
        success: true,
        id: response._id,
        version: response._version,
        result: response.result
      };
    } catch (error) {
      console.error('Update document error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(index, id) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.delete({
        index,
        id
      });

      return {
        success: true,
        result: response.result
      };
    } catch (error) {
      console.error('Delete document error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk operations
   */
  async bulkOperation(operations) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.bulk({
        body: operations,
        refresh: true
      });

      const results = {
        success: !response.errors,
        took: response.took,
        items: response.items,
        errors: []
      };

      if (response.errors) {
        response.items.forEach((item, index) => {
          Object.keys(item).forEach(action => {
            if (item[action].error) {
              results.errors.push({
                index,
                action,
                error: item[action].error
              });
            }
          });
        });
      }

      return results;
    } catch (error) {
      console.error('Bulk operation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Advanced search with filters, aggregations, and pagination
   */
  async search(options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const {
        index = this.indices.excel,
        query = '',
        filters = {},
        aggregations = {},
        sort = [{ created_at: { order: 'desc' } }],
        size = 20,
        from = 0,
        highlight = true,
        includeAggregations = false
      } = options;

      const searchBody = {
        query: this.buildQuery(query, filters),
        sort,
        size,
        from
      };

      // Add highlighting
      if (highlight) {
        searchBody.highlight = {
          fields: {
            search_text: { fragment_size: 150, number_of_fragments: 3 },
            pensioner_name: {},
            ppo_number: {},
            bank_name: {},
            'additional_data.*': {}
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>']
        };
      }

      // Add aggregations
      if (includeAggregations || Object.keys(aggregations).length > 0) {
        searchBody.aggs = Object.keys(aggregations).length > 0 ? aggregations : this.getDefaultAggregations();
      }

      const response = await this.esClient.search({
        index,
        body: searchBody
      });

      return {
        success: true,
        total: response.hits.total.value,
        took: response.took,
        data: response.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          index: hit._index,
          ...hit._source,
          highlights: hit.highlight || {}
        })),
        aggregations: response.aggregations || {}
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
  buildQuery(query, filters) {
    const must = [];
    const filter = [];

    // Text search
    if (query && query.trim()) {
      const trimmedQuery = query.trim();
      
      // Check if it's a specific field search (field:value)
      if (trimmedQuery.includes(':')) {
        const [field, value] = trimmedQuery.split(':', 2);
        must.push({
          match: {
            [field.trim()]: {
              query: value.trim(),
              fuzziness: 'AUTO'
            }
          }
        });
      } else {
        // Multi-field search
        must.push({
          multi_match: {
            query: trimmedQuery,
            fields: [
              'search_text^1',
              'pensioner_name^3',
              'ppo_number^3',
              'bank_name^2',
              'account_number^2',
              'ifsc_code^2',
              'state^2',
              'district^2',
              'pincode^2',
              'department',
              'designation',
              'additional_data.*'
            ],
            type: 'best_fields',
            fuzziness: 'AUTO',
            operator: 'and'
          }
        });
      }
    }

    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== '') {
        if (Array.isArray(value)) {
          filter.push({ terms: { [field]: value } });
        } else if (typeof value === 'object' && value.range) {
          filter.push({ range: { [field]: value.range } });
        } else if (field.includes('date') && typeof value === 'object') {
          filter.push({ range: { [field]: value } });
        } else {
          // Use term query for exact matches, match for text fields
          const isTextField = ['pensioner_name', 'bank_name', 'branch_name', 'address'].includes(field);
          if (isTextField) {
            must.push({
              match: {
                [field]: {
                  query: value,
                  operator: 'and'
                }
              }
            });
          } else {
            filter.push({ term: { [field]: value } });
          }
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
   * Get default aggregations
   */
  getDefaultAggregations() {
    return {
      states: {
        terms: { 
          field: 'state', 
          size: 50,
          order: { _count: 'desc' }
        }
      },
      districts: {
        terms: { 
          field: 'district', 
          size: 100,
          order: { _count: 'desc' }
        }
      },
      banks: {
        terms: { 
          field: 'bank_name.keyword', 
          size: 50,
          order: { _count: 'desc' }
        }
      },
      pension_types: {
        terms: { 
          field: 'pension_type', 
          size: 20,
          order: { _count: 'desc' }
        }
      },
      departments: {
        terms: { 
          field: 'department', 
          size: 30,
          order: { _count: 'desc' }
        }
      },
      verification_status: {
        terms: { 
          field: 'verification_status', 
          size: 10,
          order: { _count: 'desc' }
        }
      },
      upload_timeline: {
        date_histogram: {
          field: 'file_metadata.upload_date',
          calendar_interval: 'day',
          order: { _key: 'desc' }
        }
      },
      pension_amount_stats: {
        stats: {
          field: 'pension_amount'
        }
      },
      age_distribution: {
        histogram: {
          field: 'age',
          interval: 5,
          min_doc_count: 1
        }
      }
    };
  }

  /**
   * Get suggestions for autocomplete
   */
  async getSuggestions(field, query, size = 10) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.search({
        index: this.indices.excel,
        body: {
          size: 0,
          aggs: {
            suggestions: {
              terms: {
                field: field,
                include: `.*${query}.*`,
                size: size,
                order: { _count: 'desc' }
              }
            }
          }
        }
      });

      return {
        success: true,
        suggestions: response.aggregations.suggestions.buckets.map(bucket => ({
          value: bucket.key,
          count: bucket.doc_count
        }))
      };
    } catch (error) {
      console.error('Suggestions error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get statistics for dashboard
   */
  async getStatistics(index = this.indices.excel) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.search({
        index,
        body: {
          size: 0,
          aggs: {
            total_records: {
              value_count: { field: '_id' }
            },
            unique_states: {
              cardinality: { field: 'state' }
            },
            unique_districts: {
              cardinality: { field: 'district' }
            },
            unique_banks: {
              cardinality: { field: 'bank_name.keyword' }
            },
            pension_amount_stats: {
              stats: { field: 'pension_amount' }
            },
            recent_uploads: {
              date_histogram: {
                field: 'file_metadata.upload_date',
                calendar_interval: 'day',
                order: { _key: 'desc' }
              }
            },
            top_states: {
              terms: {
                field: 'state',
                size: 10,
                order: { _count: 'desc' }
              }
            },
            verification_status_breakdown: {
              terms: {
                field: 'verification_status',
                size: 10
              }
            }
          }
        }
      });

      return {
        success: true,
        statistics: {
          totalRecords: response.aggregations.total_records.value,
          uniqueStates: response.aggregations.unique_states.value,
          uniqueDistricts: response.aggregations.unique_districts.value,
          uniqueBanks: response.aggregations.unique_banks.value,
          pensionAmountStats: response.aggregations.pension_amount_stats,
          recentUploads: response.aggregations.recent_uploads.buckets,
          topStates: response.aggregations.top_states.buckets,
          verificationStatusBreakdown: response.aggregations.verification_status_breakdown.buckets
        }
      };
    } catch (error) {
      console.error('Statistics error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export data with filters
   */
  async exportData(options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const {
        index = this.indices.excel,
        query = '',
        filters = {},
        fields = [],
        format = 'json',
        maxSize = 10000
      } = options;

      const searchBody = {
        query: this.buildQuery(query, filters),
        size: maxSize,
        _source: fields.length > 0 ? fields : true,
        sort: [{ created_at: { order: 'desc' } }]
      };

      const response = await this.esClient.search({
        index,
        body: searchBody
      });

      const data = response.hits.hits.map(hit => ({
        id: hit._id,
        ...hit._source
      }));

      return {
        success: true,
        total: response.hits.total.value,
        exported: data.length,
        data,
        format
      };
    } catch (error) {
      console.error('Export error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete documents by query
   */
  async deleteByQuery(index, query, filters = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.deleteByQuery({
        index,
        body: {
          query: this.buildQuery(query, filters)
        },
        refresh: true
      });

      return {
        success: true,
        deleted: response.deleted,
        took: response.took
      };
    } catch (error) {
      console.error('Delete by query error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update documents by query
   */
  async updateByQuery(index, query, filters = {}, script) {
    try {
      if (!this.isConnected) {
        throw new Error('Elasticsearch is not connected');
      }

      const response = await this.esClient.updateByQuery({
        index,
        body: {
          query: this.buildQuery(query, filters),
          script: {
            source: script,
            lang: 'painless'
          }
        },
        refresh: true
      });

      return {
        success: true,
        updated: response.updated,
        took: response.took
      };
    } catch (error) {
      console.error('Update by query error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get index health and statistics
   */
  async getIndexHealth() {
    try {
      if (!this.isConnected) {
        return { error: 'Elasticsearch is not connected' };
      }

      const health = {};
      
      for (const [name, index] of Object.entries(this.indices)) {
        try {
          const stats = await this.esClient.indices.stats({ index });
          const count = await this.esClient.count({ index });
          
          health[name] = {
            index,
            documentCount: count.count,
            sizeInBytes: stats.indices[index]?.total?.store?.size_in_bytes || 0,
            status: 'healthy'
          };
        } catch (error) {
          health[name] = {
            index,
            status: 'error',
            error: error.message
          };
        }
      }

      return { success: true, indices: health };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ElasticsearchDataService;
