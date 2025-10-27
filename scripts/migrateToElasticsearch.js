#!/usr/bin/env node

/**
 * Migration Script: SQLite to Elasticsearch
 * Run this script to migrate existing SQLite data to Elasticsearch
 */

const DataMigration = require('../utils/dataMigration');

async function runMigration() {
  console.log('🚀 Starting SQLite to Elasticsearch Migration');
  console.log('=' * 50);

  const migration = new DataMigration();

  try {
    // Step 1: Check migration readiness
    console.log('🔍 Step 1: Checking migration readiness...');
    const readiness = await migration.checkMigrationReadiness();
    
    if (!readiness.ready) {
      console.error('❌ Migration not ready:', readiness.error);
      process.exit(1);
    }

    console.log('✅ Migration readiness check passed');
    console.log(`📊 Available tables: ${readiness.availableTables.join(', ')}`);
    console.log(`📈 Total records to migrate: ${readiness.totalRecords}`);
    console.log('');

    // Step 2: Confirm migration
    if (process.argv.includes('--force') || process.argv.includes('-f')) {
      console.log('⚡ Force flag detected, proceeding with migration...');
    } else {
      console.log('⚠️  This will migrate all SQLite data to Elasticsearch');
      console.log('💡 Use --force or -f flag to skip this confirmation');
      console.log('🛑 Press Ctrl+C to cancel, or wait 10 seconds to continue...');
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Step 3: Run migration
    console.log('🔄 Step 2: Starting data migration...');
    
    const migrationOptions = {
      batchSize: 1000,
      deleteExisting: process.argv.includes('--clean'),
      onProgress: (progress) => {
        const { table, processed, totalRecords, percentage } = progress;
        console.log(`📊 ${table}: ${processed}/${totalRecords} (${percentage}%)`);
      }
    };

    const result = await migration.migrateAllData(migrationOptions);

    if (!result.success) {
      console.error('❌ Migration failed:', result.error);
      process.exit(1);
    }

    // Step 4: Display results
    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('=' * 50);
    console.log('📊 Migration Summary:');
    console.log(`   Total Records: ${result.summary.totalRecords}`);
    console.log(`   Migrated: ${result.summary.totalMigrated}`);
    console.log(`   Errors: ${result.summary.totalErrors}`);
    console.log(`   Start Time: ${result.summary.startTime}`);
    console.log(`   End Time: ${result.summary.endTime}`);
    console.log('');

    // Table-wise results
    console.log('📋 Table-wise Results:');
    Object.entries(result.tables).forEach(([tableName, tableResult]) => {
      console.log(`   ${tableName}:`);
      console.log(`     Target Index: ${tableResult.targetIndex}`);
      console.log(`     Records: ${tableResult.totalRecords}`);
      console.log(`     Migrated: ${tableResult.migrated}`);
      console.log(`     Errors: ${tableResult.errors}`);
      console.log(`     Success: ${tableResult.success ? '✅' : '❌'}`);
    });

    // Step 5: Verify migration
    console.log('');
    console.log('🔍 Step 3: Verifying migration...');
    const verification = await migration.verifyMigration();

    if (verification.success) {
      console.log('✅ Migration verification passed');
      console.log(`📊 SQLite Records: ${verification.summary.totalSQLiteRecords}`);
      console.log(`📊 Elasticsearch Records: ${verification.summary.totalElasticsearchRecords}`);
      console.log(`🎯 Match: ${verification.summary.match ? '✅' : '❌'}`);
    } else {
      console.error('❌ Migration verification failed:', verification.error);
    }

    console.log('');
    console.log('🎉 Migration process completed!');
    console.log('💡 You can now use Elasticsearch for Excel file uploads and advanced search');

  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
function showHelp() {
  console.log('SQLite to Elasticsearch Migration Script');
  console.log('');
  console.log('Usage: node scripts/migrateToElasticsearch.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force, -f     Skip confirmation prompt');
  console.log('  --clean         Delete existing Elasticsearch data before migration');
  console.log('  --help, -h      Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/migrateToElasticsearch.js');
  console.log('  node scripts/migrateToElasticsearch.js --force');
  console.log('  node scripts/migrateToElasticsearch.js --force --clean');
}

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Run migration
runMigration().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
