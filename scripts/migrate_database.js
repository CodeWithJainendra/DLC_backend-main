#!/usr/bin/env node

/**
 * Database Migration Script
 * Migrates all data from my_db.db to DLC_Database.db
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseMigrator {
  constructor() {
    this.sourceDbPath = path.join(__dirname, '..', 'my_db.db');
    this.targetDbPath = path.join(__dirname, '..', 'DLC_Database.db');
    this.sourceDb = null;
    this.targetDb = null;
  }

  async connectDatabases() {
    return new Promise((resolve, reject) => {
      this.sourceDb = new sqlite3.Database(this.sourceDbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to source database: ${err.message}`));
          return;
        }
        
        this.targetDb = new sqlite3.Database(this.targetDbPath, (err) => {
          if (err) {
            reject(new Error(`Failed to connect to target database: ${err.message}`));
            return;
          }
          
          console.log('✅ Connected to both databases');
          resolve();
        });
      });
    });
  }

  async getTableNames(db) {
    return new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => row.name));
      });
    });
  }

  async getTableSchema(db, tableName) {
    return new Promise((resolve, reject) => {
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [tableName], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? row.sql : null);
      });
    });
  }

  async getTableData(db, tableName) {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async createTableInTarget(tableName, schema) {
    return new Promise((resolve, reject) => {
      // Replace the table name in the schema if needed
      const adjustedSchema = schema.replace(/CREATE TABLE\s+(\w+)/i, `CREATE TABLE IF NOT EXISTS ${tableName}`);
      
      this.targetDb.run(adjustedSchema, (err) => {
        if (err) {
          reject(new Error(`Failed to create table ${tableName}: ${err.message}`));
          return;
        }
        console.log(`✅ Created table: ${tableName}`);
        resolve();
      });
    });
  }

  async insertDataToTable(tableName, rows) {
    if (rows.length === 0) {
      console.log(`⚠️  No data to migrate for table: ${tableName}`);
      return;
    }

    return new Promise((resolve, reject) => {
      // Get column names from the first row
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      
      const stmt = this.targetDb.prepare(insertSql);
      
      let inserted = 0;
      let errors = 0;
      
      this.targetDb.serialize(() => {
        rows.forEach(row => {
          try {
            const values = columns.map(col => row[col]);
            stmt.run(values);
            inserted++;
          } catch (err) {
            console.error(`❌ Error inserting row into ${tableName}:`, err.message);
            errors++;
          }
        });
        
        stmt.finalize((err) => {
          if (err) {
            reject(new Error(`Failed to finalize statement for ${tableName}: ${err.message}`));
            return;
          }
          
          console.log(`✅ Migrated ${inserted} rows to ${tableName} (${errors} errors)`);
          resolve();
        });
      });
    });
  }

  async migrateTable(tableName) {
    try {
      console.log(`\n🔄 Migrating table: ${tableName}`);
      
      // Get schema from source
      const schema = await this.getTableSchema(this.sourceDb, tableName);
      if (!schema) {
        console.log(`⚠️  Schema not found for table: ${tableName}`);
        return;
      }
      
      // Create table in target (if it doesn't exist)
      await this.createTableInTarget(tableName, schema);
      
      // Get data from source
      const data = await this.getTableData(this.sourceDb, tableName);
      console.log(`📊 Found ${data.length} rows in ${tableName}`);
      
      // Insert data into target
      await this.insertDataToTable(tableName, data);
      
      console.log(`✅ Completed migration of table: ${tableName}`);
    } catch (error) {
      console.error(`❌ Failed to migrate table ${tableName}:`, error.message);
    }
  }

  async migrateAllTables() {
    try {
      await this.connectDatabases();
      
      console.log('\n🚀 Starting database migration...');
      console.log(`📁 Source: ${this.sourceDbPath}`);
      console.log(`📁 Target: ${this.targetDbPath}`);
      
      // Get all tables from source database
      const tables = await this.getTableNames(this.sourceDb);
      console.log(`📋 Found ${tables.length} tables to migrate: ${tables.join(', ')}`);
      
      // Migrate each table
      for (const tableName of tables) {
        await this.migrateTable(tableName);
      }
      
      console.log('\n🎉 Database migration completed successfully!');
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    } finally {
      // Close database connections
      if (this.sourceDb) {
        this.sourceDb.close();
      }
      if (this.targetDb) {
        this.targetDb.close();
      }
    }
  }
}

// Run migration
async function main() {
  const migrator = new DatabaseMigrator();
  
  try {
    await migrator.migrateAllTables();
    console.log('\n✅ Migration process finished!');
  } catch (error) {
    console.error('❌ Migration process failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DatabaseMigrator;