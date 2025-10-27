/**
 * Database Backup Script
 * Create backups of the authentication and pension data
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

class DatabaseBackup {
  constructor() {
    this.dbPath = './database.db';
    this.backupDir = './backups';
    this.ensureBackupDirectory();
  }

  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create a full database backup
   */
  async createFullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `dlc_pension_backup_${timestamp}.db`;
    const backupPath = path.join(this.backupDir, backupFileName);

    try {
      // Copy the database file
      fs.copyFileSync(this.dbPath, backupPath);
      
      console.log(`✅ Full backup created: ${backupFileName}`);
      console.log(`   Size: ${this.getFileSize(backupPath)}`);
      console.log(`   Path: ${backupPath}`);
      
      return backupPath;
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    }
  }

  /**
   * Create a SQL dump backup
   */
  async createSQLDump() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dumpFileName = `dlc_pension_dump_${timestamp}.sql`;
    const dumpPath = path.join(this.backupDir, dumpFileName);

    try {
      const db = new Database(this.dbPath, { readonly: true });
      
      let sqlDump = '-- DLC Pension Database Backup\n';
      sqlDump += `-- Created: ${new Date().toISOString()}\n\n`;

      // Get all tables
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();

      for (const table of tables) {
        const tableName = table.name;
        
        // Get table schema
        const schema = db.prepare(`
          SELECT sql FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(tableName);

        sqlDump += `-- Table: ${tableName}\n`;
        sqlDump += `DROP TABLE IF EXISTS ${tableName};\n`;
        sqlDump += `${schema.sql};\n\n`;

        // Get table data
        const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
        
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const columnNames = columns.join(', ');
          
          sqlDump += `-- Data for ${tableName}\n`;
          
          for (const row of rows) {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              }
              return value;
            }).join(', ');
            
            sqlDump += `INSERT INTO ${tableName} (${columnNames}) VALUES (${values});\n`;
          }
          sqlDump += '\n';
        }
      }

      fs.writeFileSync(dumpPath, sqlDump, 'utf8');
      db.close();
      
      console.log(`✅ SQL dump created: ${dumpFileName}`);
      console.log(`   Size: ${this.getFileSize(dumpPath)}`);
      console.log(`   Tables: ${tables.length}`);
      
      return dumpPath;
    } catch (error) {
      console.error('❌ SQL dump failed:', error.message);
      throw error;
    }
  }

  /**
   * Create user data backup (without sensitive info)
   */
  async createUserDataBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `user_data_backup_${timestamp}.json`;
    const backupPath = path.join(this.backupDir, backupFileName);

    try {
      const db = new Database(this.dbPath, { readonly: true });
      
      const backupData = {
        timestamp: new Date().toISOString(),
        users: [],
        roles: [],
        sessions: [],
        activityLog: []
      };

      // Backup users (without passwords)
      const users = db.prepare(`
        SELECT id, username, email, full_name, role_id, department, 
               data_access_level, allowed_states, allowed_districts,
               is_active, email_verified, last_login, created_at
        FROM users
      `).all();
      
      backupData.users = users;

      // Backup roles
      const roles = db.prepare(`SELECT * FROM roles`).all();
      backupData.roles = roles;

      // Backup recent sessions (last 30 days)
      const sessions = db.prepare(`
        SELECT user_id, ip_address, user_agent, created_at, last_accessed, is_active
        FROM user_sessions 
        WHERE created_at > datetime('now', '-30 days')
      `).all();
      
      backupData.sessions = sessions;

      // Backup recent activity (last 30 days)
      const activities = db.prepare(`
        SELECT user_id, action, resource, ip_address, success, created_at
        FROM user_activity_log 
        WHERE created_at > datetime('now', '-30 days')
        ORDER BY created_at DESC
        LIMIT 1000
      `).all();
      
      backupData.activityLog = activities;

      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      db.close();
      
      console.log(`✅ User data backup created: ${backupFileName}`);
      console.log(`   Users: ${users.length}`);
      console.log(`   Sessions: ${sessions.length}`);
      console.log(`   Activities: ${activities.length}`);
      
      return backupPath;
    } catch (error) {
      console.error('❌ User data backup failed:', error.message);
      throw error;
    }
  }

  /**
   * List all backups
   */
  listBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backups = files
        .filter(file => file.includes('backup') || file.includes('dump'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: this.getFileSize(filePath),
            created: stats.mtime.toISOString(),
            type: file.includes('.db') ? 'Full Backup' : 
                  file.includes('.sql') ? 'SQL Dump' : 'User Data'
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      console.log('\n📋 Available Backups:');
      console.log('─'.repeat(80));
      console.log('Name'.padEnd(40) + 'Type'.padEnd(15) + 'Size'.padEnd(10) + 'Created');
      console.log('─'.repeat(80));
      
      backups.forEach(backup => {
        console.log(
          backup.name.padEnd(40) + 
          backup.type.padEnd(15) + 
          backup.size.padEnd(10) + 
          new Date(backup.created).toLocaleString()
        );
      });
      
      if (backups.length === 0) {
        console.log('No backups found');
      }
      
      return backups;
    } catch (error) {
      console.error('❌ Failed to list backups:', error.message);
      return [];
    }
  }

  /**
   * Clean old backups (keep last N backups)
   */
  cleanOldBackups(keepCount = 10) {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backups = files
        .filter(file => file.includes('backup') || file.includes('dump'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          created: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.created - a.created);

      if (backups.length > keepCount) {
        const toDelete = backups.slice(keepCount);
        
        console.log(`🧹 Cleaning old backups (keeping ${keepCount} most recent)...`);
        
        toDelete.forEach(backup => {
          fs.unlinkSync(backup.path);
          console.log(`   Deleted: ${backup.name}`);
        });
        
        console.log(`✅ Cleaned ${toDelete.length} old backups`);
      } else {
        console.log(`✅ No cleanup needed (${backups.length} backups, keeping ${keepCount})`);
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  /**
   * Get human-readable file size
   */
  getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Verify backup integrity
   */
  verifyBackup(backupPath) {
    try {
      if (backupPath.endsWith('.db')) {
        // Verify SQLite database
        const db = new Database(backupPath, { readonly: true });
        const result = db.prepare('PRAGMA integrity_check').get();
        db.close();
        
        if (result.integrity_check === 'ok') {
          console.log('✅ Database backup integrity verified');
          return true;
        } else {
          console.log('❌ Database backup integrity check failed');
          return false;
        }
      } else if (backupPath.endsWith('.json')) {
        // Verify JSON structure
        const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        const requiredFields = ['timestamp', 'users', 'roles'];
        
        const isValid = requiredFields.every(field => data.hasOwnProperty(field));
        
        if (isValid) {
          console.log('✅ JSON backup structure verified');
          return true;
        } else {
          console.log('❌ JSON backup structure invalid');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Backup verification failed:', error.message);
      return false;
    }
  }
}

// CLI interface
async function main() {
  const backup = new DatabaseBackup();
  const args = process.argv.slice(2);
  
  console.log('💾 DLC Pension Database Backup Tool\n');
  
  try {
    if (args.includes('--list')) {
      backup.listBackups();
    } else if (args.includes('--clean')) {
      const keepCount = parseInt(args[args.indexOf('--clean') + 1]) || 10;
      backup.cleanOldBackups(keepCount);
    } else if (args.includes('--sql')) {
      await backup.createSQLDump();
    } else if (args.includes('--users')) {
      await backup.createUserDataBackup();
    } else if (args.includes('--verify')) {
      const backupPath = args[args.indexOf('--verify') + 1];
      if (backupPath) {
        backup.verifyBackup(backupPath);
      } else {
        console.log('❌ Please specify backup file path');
      }
    } else {
      // Default: create full backup
      const backupPath = await backup.createFullBackup();
      backup.verifyBackup(backupPath);
    }
  } catch (error) {
    console.error('❌ Backup operation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DatabaseBackup;
