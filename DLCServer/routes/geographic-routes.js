const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'database.db');
const { initializeDatabase } = require('../db/init');

// Get state-wise pensioner statistics with comprehensive data
router.get('/states', async (req, res) => {
    let db;
    try {
        // Initialize database with required tables
        await new Promise((resolve, reject) => {
            const db = initializeDatabase();
            db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Open database connection
        db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        // First, verify if tables exist
        const tablesQuery = `
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name IN ('pensioner_data', 'bank_pensioner_data', 'state_summary')
        `;

        const tables = await new Promise((resolve, reject) => {
            db.all(tablesQuery, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (tables.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: "No pensioner data available yet",
                timestamp: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('Database initialization error:', err);
        return res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: err.message
        });
    }

    const closeDb = () => {
        if (db) {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        }
    };

    try {
        // First verify if tables exist
        const tableCheck = `
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name IN ('doppw_pensioner_data', 'bank_pensioner_data', 'ubi1_pensioner_data', 'ubi3_pensioner_data')
        `;
        
        await new Promise((resolve, reject) => {
            db.all(tableCheck, [], (err, tables) => {
                if (err) {
                    reject(new Error('Failed to check database tables'));
                    return;
                }
                if (tables.length === 0) {
                    reject(new Error('Required database tables not found'));
                    return;
                }
                resolve();
            });
        });

        // Combine data from all pensioner tables with error handling
        const query = `
            WITH state_data AS (
                -- Get data from pensioner_data table
                SELECT 
                    COALESCE(UPPER(TRIM(state)), 'UNKNOWN') as state,
                    COUNT(*) as total,
                    SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END) as verified
                FROM pensioner_data
                WHERE state IS NOT NULL AND TRIM(state) != ''
                GROUP BY state
                
                UNION ALL
                
                -- Get data from bank_pensioner_data table
                SELECT 
                    COALESCE(UPPER(TRIM(bank_state)), 'UNKNOWN') as state,
                    SUM(total_pensioners) as total,
                    SUM(verified_pensioners) as verified
                FROM bank_pensioner_data
                WHERE bank_state IS NOT NULL AND TRIM(bank_state) != ''
                GROUP BY bank_state
            )
            SELECT 
                state,
                SUM(total) as total_pensioners,
                SUM(verified) as verified_pensioners,
                ROUND(CAST(SUM(verified) AS FLOAT) * 100 / NULLIF(SUM(total), 0), 2) as verification_rate
            FROM state_data
            WHERE state != 'UNKNOWN'
            GROUP BY state
            ORDER BY total_pensioners DESC`;

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('Database query error:', err);
                    reject(new Error('Failed to execute database query'));
                    return;
                }
                if (!Array.isArray(rows)) {
                    reject(new Error('Invalid database response'));
                    return;
                }
                resolve(rows);
            });
        });

        // Filter out any invalid data
        const validRows = rows.filter(row => 
            row.state && 
            !isNaN(row.total_pensioners) && 
            !isNaN(row.verified_pensioners)
        );

        // Calculate totals
        const totalPensioners = validRows.reduce((sum, row) => sum + (row.total_pensioners || 0), 0);
        const totalVerified = validRows.reduce((sum, row) => sum + (row.verified_pensioners || 0), 0);

        res.json({
            success: true,
            data: validRows,
            summary: {
                total_states: validRows.length,
                total_pensioners: totalPensioners,
                total_verified: totalVerified,
                overall_verification_rate: totalPensioners > 0 ? 
                    parseFloat(((totalVerified / totalPensioners) * 100).toFixed(2)) : 0
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in /geography/states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch state-wise pensioner data',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

module.exports = router;