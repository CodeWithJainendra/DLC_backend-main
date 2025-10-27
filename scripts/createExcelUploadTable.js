/**
 * Create Excel Upload History Table
 * Creates table to track Excel file uploads and processing results
 */

const { database } = require('../config/database');

async function createExcelUploadTable() {
  console.log('📊 Creating Excel upload history table...');
  
  const db = database.getDB();
  
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS excel_upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      total_records INTEGER DEFAULT 0,
      tables_detected INTEGER DEFAULT 0,
      records_inserted INTEGER DEFAULT 0,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'processing',
      uploaded_by INTEGER,
      processing_time INTEGER, -- in milliseconds
      error_message TEXT,
      table_mappings TEXT, -- JSON string of detected mappings
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `;

  return new Promise((resolve, reject) => {
    db.run(createTableSQL, function(err) {
      if (err) {
        console.error('❌ Failed to create excel_upload_history table:', err);
        reject(err);
      } else {
        console.log('✅ Excel upload history table created successfully');
        
        // Create index for better performance
        const createIndexSQL = `
          CREATE INDEX IF NOT EXISTS idx_excel_upload_user_date 
          ON excel_upload_history(uploaded_by, upload_date DESC)
        `;
        
        db.run(createIndexSQL, function(indexErr) {
          if (indexErr) {
            console.warn('⚠️ Failed to create index:', indexErr);
          } else {
            console.log('✅ Index created for excel_upload_history');
          }
          resolve();
        });
      }
    });
  });
}

// Run if called directly
if (require.main === module) {
  createExcelUploadTable()
    .then(() => {
      console.log('🎉 Excel upload table setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createExcelUploadTable };
