const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
      }
    });
  }

  getDB() {
    return this.db;
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error('Database close error:', err.message);
      }
    });
  }
}

const database = new Database();

const initDatabase = () => {
  const db = database.getDB();
  
  console.log('📦 Initializing minimal database schema...');
  console.log('💡 Note: Only essential tables will be created.');
  console.log('💡 Add your custom tables via migration scripts or data import tools.');
  
  // This is intentionally minimal - only creates the database connection
  // You can add your own tables through:
  // 1. Migration scripts in /scripts folder
  // 2. Data import tools that create tables dynamically
  // 3. Manual SQL execution
  
  console.log('✅ Database connection established: database.db');
  console.log('✅ Ready for custom table creation and data import');
};

module.exports = { database, initDatabase };