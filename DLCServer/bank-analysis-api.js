const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./database.db');

// Bank Analysis API - Comprehensive bank-wise pensioner verification data
app.get('/api/bank-analysis', (req, res) => {
    const { state, district, pincode, bank_name, limit = 100, offset = 0 } = req.query;
    
    // Build WHERE clauses for filtering
    let whereConditions = [];
    let params = [];
    
    if (state) {
        whereConditions.push("(bank_state LIKE ? OR pensioner_state LIKE ? OR branch_state LIKE ?)");
        params.push(`%${state}%`, `%${state}%`, `%${state}%`);
    }
    
    if (district) {
        whereConditions.push("pensioner_district LIKE ?");
        params.push(`%${district}%`);
    }
    
    if (pincode) {
        whereConditions.push("(branch_pin_code LIKE ? OR pensioner_pincode LIKE ? OR branch_pincode LIKE ?)");
        params.push(`%${pincode}%`, `%${pincode}%`, `%${pincode}%`);
    }
    
    if (bank_name) {
        whereConditions.push("bank_name LIKE ?");
        params.push(`%${bank_name}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query to get comprehensive bank analysis
    const query = `
        WITH bank_analysis AS (
            -- Bank Pensioner Data Analysis
            SELECT 
                'bank_pensioner_data' as source_table,
                bank_name,
                bank_state as state,
                bank_city as district,
                branch_pin_code as pincode,
                SUM(age_less_than_80 + age_more_than_80 + age_not_available) as total_pensioners,
                SUM(age_less_than_80) as age_less_80,
                SUM(age_more_than_80) as age_more_80,
                SUM(age_not_available) as age_not_available,
                COUNT(*) as total_records
            FROM bank_pensioner_data 
            ${whereClause}
            GROUP BY bank_name, bank_state, bank_city, branch_pin_code
            
            UNION ALL
            
            -- UBI1 Pensioner Data Analysis
            SELECT 
                'ubi1_pensioner_data' as source_table,
                bank_name,
                pensioner_state as state,
                pensioner_city as district,
                pensioner_pincode as pincode,
                COUNT(*) as total_pensioners,
                COUNT(CASE WHEN age < 80 THEN 1 END) as age_less_80,
                COUNT(CASE WHEN age >= 80 THEN 1 END) as age_more_80,
                COUNT(CASE WHEN age IS NULL THEN 1 END) as age_not_available,
                COUNT(*) as total_records
            FROM ubi1_pensioner_data 
            ${whereClause.replace(/branch_pin_code/g, 'pensioner_pincode').replace(/branch_state/g, 'pensioner_state')}
            GROUP BY bank_name, pensioner_state, pensioner_city, pensioner_pincode
            
            UNION ALL
            
            -- UBI3 Pensioner Data Analysis
            SELECT 
                'ubi3_pensioner_data' as source_table,
                bank_name,
                pensioner_state as state,
                pensioner_city as district,
                pensioner_pincode as pincode,
                COUNT(*) as total_pensioners,
                COUNT(CASE WHEN age < 80 THEN 1 END) as age_less_80,
                COUNT(CASE WHEN age >= 80 THEN 1 END) as age_more_80,
                COUNT(CASE WHEN age IS NULL THEN 1 END) as age_not_available,
                COUNT(*) as total_records
            FROM ubi3_pensioner_data 
            ${whereClause.replace(/branch_pin_code/g, 'pensioner_pincode').replace(/bank_state/g, 'pensioner_state')}
            GROUP BY bank_name, pensioner_state, pensioner_city, pensioner_pincode
            
            UNION ALL
            
            -- DOPPW Pensioner Data Analysis (branch-wise)
            SELECT 
                'doppw_pensioner_data' as source_table,
                branch_name as bank_name,
                branch_state as state,
                pensioner_district as district,
                pensioner_pincode as pincode,
                COUNT(*) as total_pensioners,
                COUNT(CASE WHEN age < 80 THEN 1 END) as age_less_80,
                COUNT(CASE WHEN age >= 80 THEN 1 END) as age_more_80,
                COUNT(CASE WHEN age IS NULL THEN 1 END) as age_not_available,
                COUNT(*) as total_records
            FROM doppw_pensioner_data 
            ${whereClause.replace(/bank_name/g, 'branch_name').replace(/bank_state/g, 'branch_state').replace(/branch_pin_code/g, 'pensioner_pincode')}
            GROUP BY branch_name, branch_state, pensioner_district, pensioner_pincode
        )
        SELECT 
            bank_name,
            state,
            district,
            pincode,
            SUM(total_pensioners) as total_verified_pensioners,
            SUM(age_less_80) as pensioners_below_80,
            SUM(age_more_80) as pensioners_above_80,
            SUM(age_not_available) as pensioners_age_unknown,
            SUM(total_records) as total_database_records,
            GROUP_CONCAT(DISTINCT source_table) as data_sources,
            ROUND((SUM(total_pensioners) * 100.0 / (
                SELECT SUM(total_pensioners) FROM bank_analysis
            )), 2) as percentage_of_total
        FROM bank_analysis
        WHERE bank_name IS NOT NULL AND bank_name != ''
        GROUP BY bank_name, state, district, pincode
        ORDER BY total_verified_pensioners DESC
        LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                error: 'Database query failed', 
                details: err.message 
            });
        }
        
        // Get summary statistics
        const summaryQuery = `
            WITH all_data AS (
                SELECT bank_name, SUM(age_less_than_80 + age_more_than_80 + age_not_available) as total
                FROM bank_pensioner_data WHERE bank_name IS NOT NULL GROUP BY bank_name
                UNION ALL
                SELECT bank_name, COUNT(*) as total
                FROM ubi1_pensioner_data WHERE bank_name IS NOT NULL GROUP BY bank_name
                UNION ALL
                SELECT bank_name, COUNT(*) as total
                FROM ubi3_pensioner_data WHERE bank_name IS NOT NULL GROUP BY bank_name
                UNION ALL
                SELECT branch_name as bank_name, COUNT(*) as total
                FROM doppw_pensioner_data WHERE branch_name IS NOT NULL GROUP BY branch_name
            )
            SELECT 
                COUNT(DISTINCT bank_name) as total_unique_banks,
                SUM(total) as grand_total_pensioners,
                AVG(total) as avg_pensioners_per_bank,
                MAX(total) as max_pensioners_single_bank
            FROM all_data
        `;
        
        db.get(summaryQuery, [], (err, summary) => {
            if (err) {
                console.error('Summary query error:', err);
                summary = {};
            }
            
            res.json({
                success: true,
                data: rows,
                summary: summary || {},
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total_records: rows.length
                },
                filters_applied: {
                    state: state || null,
                    district: district || null,
                    pincode: pincode || null,
                    bank_name: bank_name || null
                }
            });
        });
    });
});

// Top Banks API - Get banks with highest verification counts
app.get('/api/top-banks', (req, res) => {
    const { limit = 10 } = req.query;
    
    const query = `
        WITH bank_totals AS (
            SELECT bank_name, SUM(age_less_than_80 + age_more_than_80 + age_not_available) as total
            FROM bank_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != ''
            GROUP BY bank_name
            UNION ALL
            SELECT bank_name, COUNT(*) as total
            FROM ubi1_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != ''
            GROUP BY bank_name
            UNION ALL
            SELECT bank_name, COUNT(*) as total
            FROM ubi3_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != ''
            GROUP BY bank_name
            UNION ALL
            SELECT branch_name as bank_name, COUNT(*) as total
            FROM doppw_pensioner_data WHERE branch_name IS NOT NULL AND branch_name != ''
            GROUP BY branch_name
        )
        SELECT 
            bank_name,
            SUM(total) as total_verified_pensioners,
            RANK() OVER (ORDER BY SUM(total) DESC) as rank_position
        FROM bank_totals
        GROUP BY bank_name
        ORDER BY total_verified_pensioners DESC
        LIMIT ?
    `;
    
    db.all(query, [parseInt(limit)], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                error: 'Database query failed', 
                details: err.message 
            });
        }
        
        res.json({
            success: true,
            data: rows,
            message: `Top ${limit} banks by verified pensioner count`
        });
    });
});

// Bank Details API - Get detailed information for a specific bank
app.get('/api/bank-details/:bankName', (req, res) => {
    const { bankName } = req.params;
    
    const queries = {
        bank_data: `
            SELECT bank_state, bank_city, branch_pin_code, 
                   SUM(age_less_than_80) as age_less_80,
                   SUM(age_more_than_80) as age_more_80,
                   SUM(age_not_available) as age_unknown,
                   SUM(grand_total) as total_pensioners
            FROM bank_pensioner_data 
            WHERE bank_name LIKE ?
            GROUP BY bank_state, bank_city, branch_pin_code
        `,
        ubi1_data: `
            SELECT pensioner_state, pensioner_city, pensioner_pincode,
                   COUNT(*) as total_pensioners,
                   COUNT(CASE WHEN is_valid = 1 THEN 1 END) as valid_pensioners
            FROM ubi1_pensioner_data 
            WHERE bank_name LIKE ?
            GROUP BY pensioner_state, pensioner_city, pensioner_pincode
        `,
        ubi3_data: `
            SELECT pensioner_state, pensioner_city, pensioner_pincode,
                   COUNT(*) as total_pensioners,
                   COUNT(CASE WHEN is_valid = 1 THEN 1 END) as valid_pensioners
            FROM ubi3_pensioner_data 
            WHERE bank_name LIKE ?
            GROUP BY pensioner_state, pensioner_city, pensioner_pincode
        `,
        doppw_data: `
            SELECT branch_state, pensioner_district, pensioner_pincode,
                   COUNT(*) as total_pensioners,
                   COUNT(CASE WHEN submitted_status = 'Submitted' THEN 1 END) as submitted_pensioners
            FROM doppw_pensioner_data 
            WHERE branch_name LIKE ?
            GROUP BY branch_state, pensioner_district, pensioner_pincode
        `
    };
    
    const results = {};
    const searchPattern = `%${bankName}%`;
    let completedQueries = 0;
    const totalQueries = Object.keys(queries).length;
    
    Object.entries(queries).forEach(([key, query]) => {
        db.all(query, [searchPattern], (err, rows) => {
            if (err) {
                console.error(`Error in ${key}:`, err);
                results[key] = { error: err.message };
            } else {
                results[key] = rows;
            }
            
            completedQueries++;
            if (completedQueries === totalQueries) {
                res.json({
                    success: true,
                    bank_name: bankName,
                    data: results
                });
            }
        });
    });
});

// State-wise Bank Distribution API
app.get('/api/state-bank-distribution', (req, res) => {
    const query = `
        WITH state_bank_data AS (
            SELECT bank_state as state, bank_name, 
                   SUM(age_less_than_80 + age_more_than_80 + age_not_available) as pensioners
            FROM bank_pensioner_data 
            WHERE bank_state IS NOT NULL AND bank_name IS NOT NULL
            GROUP BY bank_state, bank_name
            UNION ALL
            SELECT pensioner_state as state, bank_name, COUNT(*) as pensioners
            FROM ubi1_pensioner_data 
            WHERE pensioner_state IS NOT NULL AND bank_name IS NOT NULL
            GROUP BY pensioner_state, bank_name
            UNION ALL
            SELECT pensioner_state as state, bank_name, COUNT(*) as pensioners
            FROM ubi3_pensioner_data 
            WHERE pensioner_state IS NOT NULL AND bank_name IS NOT NULL
            GROUP BY pensioner_state, bank_name
            UNION ALL
            SELECT branch_state as state, branch_name as bank_name, COUNT(*) as pensioners
            FROM doppw_pensioner_data 
            WHERE branch_state IS NOT NULL AND branch_name IS NOT NULL
            GROUP BY branch_state, branch_name
        )
        SELECT 
            state,
            COUNT(DISTINCT bank_name) as unique_banks,
            SUM(pensioners) as total_pensioners,
            GROUP_CONCAT(DISTINCT bank_name) as bank_list
        FROM state_bank_data
        GROUP BY state
        ORDER BY total_pensioners DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                error: 'Database query failed', 
                details: err.message 
            });
        }
        
        res.json({
            success: true,
            data: rows,
            message: 'State-wise bank distribution with pensioner counts'
        });
    });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Bank Analysis API Server running on port ${PORT}`);
    console.log(`Available endpoints:`);
    console.log(`- GET /api/bank-analysis - Comprehensive bank analysis with filters`);
    console.log(`- GET /api/top-banks - Top banks by verification count`);
    console.log(`- GET /api/bank-details/:bankName - Detailed bank information`);
    console.log(`- GET /api/state-bank-distribution - State-wise bank distribution`);
});