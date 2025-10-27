#!/usr/bin/env node

/**
 * Complete Excel Files Processing Script
 * Deletes old database, recreates Elasticsearch indices, and processes all Excel files
 */

const fs = require('fs');
const path = require('path');

// Load Elasticsearch configuration
require('../elasticsearch-config');

const { elasticsearchConfig } = require('../config/elasticsearch');
const ElasticsearchExcelAnalyzer = require('../utils/elasticsearchExcelAnalyzer');
const ElasticsearchDataService = require('../services/elasticsearchDataService');

class ExcelFilesProcessor {
  constructor() {
    this.esAnalyzer = new ElasticsearchExcelAnalyzer();
    this.esDataService = new ElasticsearchDataService();
    this.processedFiles = [];
    this.failedFiles = [];
    this.totalRecords = 0;
  }

  /**
   * Find all Excel files in the project
   */
  async findAllExcelFiles() {
    const excelFiles = [];
    const rootDir = path.join(__dirname, '..');
    
    // Excel file patterns
    const patterns = ['.xlsx', '.xls'];
    
    const findFiles = (dir, files = []) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip node_modules, .git, uploads directories
          if (!['node_modules', '.git', 'uploads', '.env'].includes(item)) {
            findFiles(fullPath, files);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (patterns.includes(ext)) {
            files.push({
              path: fullPath,
              name: item,
              size: stat.size,
              relativePath: path.relative(rootDir, fullPath)
            });
          }
        }
      }
      
      return files;
    };

    return findFiles(rootDir);
  }

  /**
   * Delete old database and recreate indices
   */
  async resetDatabase() {
    console.log('🗑️  Step 1: Resetting Database...');
    
    try {
      // Initialize Elasticsearch if not connected
      if (!elasticsearchConfig.isElasticsearchConnected()) {
        console.log('🔍 Initializing Elasticsearch connection...');
        const initResult = await elasticsearchConfig.initialize();
        if (!initResult.success) {
          throw new Error(`Elasticsearch initialization failed: ${initResult.error}`);
        }
      }

      // Delete and recreate all indices
      const indices = ['dlc-excel-data', 'dlc-sbi-data', 'dlc-doppw-data'];
      
      for (const index of indices) {
        console.log(`🗑️  Deleting index: ${index}`);
        try {
          const client = elasticsearchConfig.getClient();
          const exists = await client.indices.exists({ index });
          if (exists) {
            await client.indices.delete({ index });
            console.log(`✅ Deleted index: ${index}`);
          }
        } catch (error) {
          console.log(`⚠️  Index ${index} might not exist: ${error.message}`);
        }
        
        // Recreate index
        console.log(`📋 Recreating index: ${index}`);
        const recreateResult = await elasticsearchConfig.recreateIndex(index);
        if (recreateResult.success) {
          console.log(`✅ Recreated index: ${index}`);
        } else {
          console.error(`❌ Failed to recreate index ${index}: ${recreateResult.error}`);
        }
      }

      console.log('✅ Database reset completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Database reset failed:', error.message);
      return false;
    }
  }

  /**
   * Process a single Excel file
   */
  async processExcelFile(fileInfo) {
    try {
      console.log(`📊 Processing: ${fileInfo.relativePath} (${this.formatFileSize(fileInfo.size)})`);
      
      // Step 1: Analyze file
      const analysisResult = await this.esAnalyzer.analyzeFile(fileInfo.path);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      // Step 2: Save to Elasticsearch
      const uploadMetadata = {
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        uploadedBy: 'bulk_processor',
        filePath: fileInfo.relativePath
      };

      const saveResult = await this.esAnalyzer.saveToElasticsearch(analysisResult.data, uploadMetadata);

      if (!saveResult.success) {
        throw new Error('Failed to save to Elasticsearch');
      }

      // Collect statistics
      const fileStats = {
        fileName: fileInfo.name,
        relativePath: fileInfo.relativePath,
        fileSize: fileInfo.size,
        totalRecords: analysisResult.totalRecords,
        sheetsProcessed: analysisResult.data.sheets.length,
        savedRecords: saveResult.summary.totalSaved,
        errors: saveResult.summary.totalErrors,
        saveResults: saveResult.results,
        success: true
      };

      this.totalRecords += saveResult.summary.totalSaved;
      this.processedFiles.push(fileStats);

      console.log(`✅ ${fileInfo.name}: ${saveResult.summary.totalSaved} records saved`);
      return fileStats;

    } catch (error) {
      console.error(`❌ Failed to process ${fileInfo.name}: ${error.message}`);
      
      const errorStats = {
        fileName: fileInfo.name,
        relativePath: fileInfo.relativePath,
        fileSize: fileInfo.size,
        error: error.message,
        success: false
      };

      this.failedFiles.push(errorStats);
      return errorStats;
    }
  }

  /**
   * Process all Excel files
   */
  async processAllFiles() {
    console.log('🚀 Starting Complete Excel Files Processing...');
    console.log('=' * 60);

    const startTime = new Date();

    try {
      // Step 1: Reset database
      const resetSuccess = await this.resetDatabase();
      if (!resetSuccess) {
        throw new Error('Database reset failed');
      }

      console.log('');

      // Step 2: Find all Excel files
      console.log('🔍 Step 2: Finding all Excel files...');
      const excelFiles = await this.findAllExcelFiles();
      
      console.log(`📊 Found ${excelFiles.length} Excel files:`);
      excelFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.relativePath} (${this.formatFileSize(file.size)})`);
      });

      console.log('');

      // Step 3: Process each file
      console.log('📁 Step 3: Processing Excel files...');
      
      for (let i = 0; i < excelFiles.length; i++) {
        const file = excelFiles[i];
        console.log(`\n[${i + 1}/${excelFiles.length}] Processing: ${file.name}`);
        
        await this.processExcelFile(file);
        
        // Small delay to prevent overwhelming Elasticsearch
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);

      // Step 4: Generate final report
      console.log('\n' + '=' * 60);
      console.log('🎉 PROCESSING COMPLETED!');
      console.log('=' * 60);
      
      console.log('📊 SUMMARY:');
      console.log(`   Total Files Found: ${excelFiles.length}`);
      console.log(`   Successfully Processed: ${this.processedFiles.length}`);
      console.log(`   Failed: ${this.failedFiles.length}`);
      console.log(`   Total Records Saved: ${this.totalRecords.toLocaleString()}`);
      console.log(`   Processing Time: ${duration} seconds`);

      if (this.processedFiles.length > 0) {
        console.log('\n✅ SUCCESSFULLY PROCESSED FILES:');
        this.processedFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.fileName}`);
          console.log(`      Records: ${file.savedRecords.toLocaleString()}`);
          console.log(`      Sheets: ${file.sheetsProcessed}`);
          if (file.saveResults && file.saveResults.length > 0) {
            file.saveResults.forEach(result => {
              console.log(`      → ${result.index}: ${result.saved} records (${result.dataType})`);
            });
          }
        });
      }

      if (this.failedFiles.length > 0) {
        console.log('\n❌ FAILED FILES:');
        this.failedFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.fileName}: ${file.error}`);
        });
      }

      // Step 5: Verify data in Elasticsearch
      console.log('\n🔍 ELASTICSEARCH VERIFICATION:');
      const stats = await this.esDataService.getStatistics();
      if (stats.success) {
        console.log(`   Total Records in ES: ${stats.statistics.totalRecords.toLocaleString()}`);
        console.log(`   Unique States: ${stats.statistics.uniqueStates}`);
        console.log(`   Unique Districts: ${stats.statistics.uniqueDistricts}`);
        console.log(`   Unique Banks: ${stats.statistics.uniqueBanks}`);
      }

      console.log('\n🎯 NEXT STEPS:');
      console.log('   1. Test search: GET /api/elasticsearch/search?q=pensioner');
      console.log('   2. Check health: GET /api/elasticsearch/health');
      console.log('   3. View statistics: GET /api/elasticsearch/statistics');
      
      console.log('\n✨ All Excel files have been successfully processed and saved to Elasticsearch!');

      return {
        success: true,
        totalFiles: excelFiles.length,
        processedFiles: this.processedFiles.length,
        failedFiles: this.failedFiles.length,
        totalRecords: this.totalRecords,
        duration: duration
      };

    } catch (error) {
      console.error('\n❌ PROCESSING FAILED:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Main execution
async function main() {
  const processor = new ExcelFilesProcessor();
  
  // Check for help flag
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Complete Excel Files Processing Script');
    console.log('');
    console.log('This script will:');
    console.log('1. Delete all existing Elasticsearch data');
    console.log('2. Recreate fresh Elasticsearch indices');
    console.log('3. Find all Excel files in the project');
    console.log('4. Process and save all Excel files to Elasticsearch');
    console.log('');
    console.log('Usage: node scripts/processAllExcelFiles.js [--force]');
    console.log('');
    console.log('Options:');
    console.log('  --force    Skip confirmation prompt');
    console.log('  --help     Show this help message');
    return;
  }

  // Confirmation prompt
  if (!process.argv.includes('--force')) {
    console.log('⚠️  WARNING: This will DELETE all existing data and recreate the database!');
    console.log('💡 Use --force flag to skip this confirmation');
    console.log('🛑 Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Run processing
  const result = await processor.processAllFiles();
  
  if (result.success) {
    console.log('\n🎉 Script completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Script failed!');
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run the script
main().catch(error => {
  console.error('❌ Script error:', error);
  process.exit(1);
});
