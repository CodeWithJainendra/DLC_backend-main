const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'database.db');

function initializeDatabase() {
    const db = new sqlite3.Database(DB_PATH);

    const tables = [
        `CREATE TABLE IF NOT EXISTS pensioner_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state TEXT,
            district TEXT,
            pincode TEXT,
            verification_status TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS bank_pensioner_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_name TEXT,
            bank_state TEXT,
            bank_district TEXT,
            bank_pincode TEXT,
            total_pensioners INTEGER DEFAULT 0,
            verified_pensioners INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS state_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state TEXT UNIQUE,
            total_pensioners INTEGER DEFAULT 0,
            verified_pensioners INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    db.serialize(() => {
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');

        // Create tables
        tables.forEach(table => {
            db.run(table, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                }
            });
        });

        // Create indices for better performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_pensioner_state ON pensioner_data(state)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_bank_state ON bank_pensioner_data(bank_state)`);
    });

    return db;
}

module.exports = { initializeDatabase };