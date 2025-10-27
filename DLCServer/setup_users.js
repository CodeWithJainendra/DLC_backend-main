const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

// Create users table and add default admin user
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // Create users table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // Insert default admin user (only if not exists)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role) 
        VALUES ('admin', 'Admin123!', 'admin')
    `);

    // Insert test user (only if not exists)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role) 
        VALUES ('test', 'Test123!', 'user')
    `);

    console.log('Users table setup completed');
    console.log('Default users:');
    console.log('  admin / Admin123! (admin role)');
    console.log('  test / Test123! (user role)');
});

db.close((err) => {
    if (err) {
        console.error('Error closing database:', err.message);
    } else {
        console.log('Database connection closed.');
    }
});