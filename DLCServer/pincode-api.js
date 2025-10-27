const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const router = express.Router();

const db = new sqlite3.Database('./database.db');

// Get all pincodes with statistics
router.get('/pincodes', (req, res) => {
    const { state, district, limit = 100, offset = 0 } = req.query;
    
    let query = `
        SELECT 
            ps.pincode,
            ps.state,
            ps.district,
            ps.total_pensioners,
            ps.total_banks,
            ps.total_branches,
            pm.city,
            pm.region
        FROM pincode_statistics ps
        LEFT JOIN pincode_master pm ON ps.pincode = pm.pincode
        WHERE 1=1
    `;
    
    const params = [];
    
    if (state) {
        query += ` AND ps.state LIKE ?`;
        params.push(`%${state}%`);
    }
    
    if (district) {
        query += ` AND ps.district LIKE ?`;
        params.push(`%${district}%`);
    }
    
    query += ` ORDER BY ps.total_pensioners DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM pincode_statistics WHERE 1=1`;
        const countParams = [];
        
        if (state) {
            countQuery += ` AND state LIKE ?`;
            countParams.push(`%${state}%`);
        }
        
        if (district) {
            countQuery += ` AND district LIKE ?`;
            countParams.push(`%${district}%`);
        }
        
        db.get(countQuery, countParams, (err, countRow) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                data: rows,
                pagination: {
                    total: countRow.total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (parseInt(offset) + rows.length) < countRow.total
                }
            });
        });
    });
});

// Get pincode details
router.get('/pincodes/:pincode', (req, res) => {
    const { pincode } = req.params;
    
    const query = `
        SELECT 
            pm.pincode,
            pm.state,
            pm.district,
            pm.city,
            pm.region,
            ps.total_pensioners,
            ps.total_banks,
            ps.total_branches
        FROM pincode_master pm
        LEFT JOIN pincode_statistics ps ON pm.pincode = ps.pincode
        WHERE pm.pincode = ?
    `;
    
    db.get(query, [pincode], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Pincode not found' });
        }
        
        // Get detailed pensioner data for this pincode
        const detailQuery = `
            SELECT 
                bank_name,
                bank_ifsc,
                total_pensioners,
                age_less_than_80,
                age_more_than_80,
                age_not_available,
                data_source,
                file_name
            FROM pensioner_pincode_data
            WHERE pincode = ?
            ORDER BY total_pensioners DESC
        `;
        
        db.all(detailQuery, [pincode], (err, details) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                data: {
                    ...row,
                    details: details
                }
            });
        });
    });
});

// Get state-wise summary
router.get('/states/summary', (req, res) => {
    const query = `
        SELECT 
            state,
            COUNT(DISTINCT pincode) as total_pincodes,
            SUM(total_pensioners) as total_pensioners,
            SUM(total_banks) as total_banks,
            SUM(total_branches) as total_branches
        FROM pincode_statistics
        WHERE state IS NOT NULL AND state != 'nan'
        GROUP BY state
        ORDER BY total_pensioners DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            success: true,
            data: rows
        });
    });
});

// Get district-wise summary for a state
router.get('/states/:state/districts', (req, res) => {
    const { state } = req.params;
    
    const query = `
        SELECT 
            district,
            COUNT(DISTINCT pincode) as total_pincodes,
            SUM(total_pensioners) as total_pensioners,
            SUM(total_banks) as total_banks,
            SUM(total_branches) as total_branches
        FROM pincode_statistics
        WHERE state LIKE ?
        GROUP BY district
        ORDER BY total_pensioners DESC
    `;
    
    db.all(query, [`%${state}%`], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            success: true,
            state: state,
            data: rows
        });
    });
});

// Search pincodes
router.get('/pincodes/search/:query', (req, res) => {
    const { query } = req.params;
    
    const searchQuery = `
        SELECT 
            ps.pincode,
            ps.state,
            ps.district,
            ps.total_pensioners,
            ps.total_banks,
            pm.city
        FROM pincode_statistics ps
        LEFT JOIN pincode_master pm ON ps.pincode = pm.pincode
        WHERE ps.pincode LIKE ? 
           OR ps.state LIKE ? 
           OR ps.district LIKE ?
           OR pm.city LIKE ?
        ORDER BY ps.total_pensioners DESC
        LIMIT 50
    `;
    
    const searchParam = `%${query}%`;
    
    db.all(searchQuery, [searchParam, searchParam, searchParam, searchParam], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            success: true,
            query: query,
            data: rows
        });
    });
});

// Get pensioners by pincode from all tables
router.get('/pincodes/:pincode/pensioners', (req, res) => {
    const { pincode } = req.params;
    const { source } = req.query; // bank, doppw, dot, ubi1, ubi3
    
    const queries = [];
    
    if (!source || source === 'bank') {
        queries.push({
            name: 'bank_pensioner_data',
            query: `
                SELECT 
                    'bank' as source,
                    bank_name,
                    bank_ifsc,
                    bank_state,
                    bank_city,
                    age_less_than_80,
                    age_more_than_80,
                    age_not_available,
                    grand_total as total
                FROM bank_pensioner_data
                WHERE branch_pin_code = ?
            `
        });
    }
    
    if (!source || source === 'doppw') {
        queries.push({
            name: 'doppw_pensioner_data',
            query: `
                SELECT 
                    'doppw' as source,
                    pension_type,
                    branch_state,
                    pensioner_state,
                    pensioner_district,
                    COUNT(*) as total,
                    SUM(CASE WHEN age < 80 THEN 1 ELSE 0 END) as age_less_than_80,
                    SUM(CASE WHEN age >= 80 THEN 1 ELSE 0 END) as age_more_than_80,
                    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) as age_not_available
                FROM doppw_pensioner_data
                WHERE branch_pincode = ? OR pensioner_pincode = ?
                GROUP BY pension_type, branch_state, pensioner_state, pensioner_district
            `
        });
    }
    
    if (!source || source === 'dot') {
        queries.push({
            name: 'dot_pensioner_data',
            query: `
                SELECT 
                    'dot' as source,
                    lc_category,
                    COUNT(*) as total,
                    SUM(CASE WHEN age < 80 THEN 1 ELSE 0 END) as age_less_than_80,
                    SUM(CASE WHEN age >= 80 THEN 1 ELSE 0 END) as age_more_than_80,
                    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) as age_not_available
                FROM dot_pensioner_data
                WHERE pensioner_pincode = ? OR pda_pincode = ?
                GROUP BY lc_category
            `
        });
    }
    
    if (!source || source === 'ubi') {
        queries.push({
            name: 'ubi1_pensioner_data',
            query: `
                SELECT 
                    'ubi1' as source,
                    bank_name,
                    pensioner_state,
                    pensioner_city,
                    COUNT(*) as total,
                    SUM(CASE WHEN age < 80 THEN 1 ELSE 0 END) as age_less_than_80,
                    SUM(CASE WHEN age >= 80 THEN 1 ELSE 0 END) as age_more_than_80,
                    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) as age_not_available
                FROM ubi1_pensioner_data
                WHERE pensioner_pincode = ?
                GROUP BY bank_name, pensioner_state, pensioner_city
            `
        });
        
        queries.push({
            name: 'ubi3_pensioner_data',
            query: `
                SELECT 
                    'ubi3' as source,
                    bank_name,
                    pensioner_state,
                    pensioner_city,
                    COUNT(*) as total,
                    SUM(CASE WHEN age < 80 THEN 1 ELSE 0 END) as age_less_than_80,
                    SUM(CASE WHEN age >= 80 THEN 1 ELSE 0 END) as age_more_than_80,
                    SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) as age_not_available
                FROM ubi3_pensioner_data
                WHERE branch_pincode = ? OR pensioner_pincode = ?
                GROUP BY bank_name, pensioner_state, pensioner_city
            `
        });
    }
    
    const results = {};
    let completed = 0;
    
    queries.forEach(({ name, query }) => {
        const params = query.includes('?') ? 
            (query.split('?').length - 1 === 1 ? [pincode] : [pincode, pincode]) : 
            [];
        
        db.all(query, params, (err, rows) => {
            if (!err) {
                results[name] = rows;
            }
            
            completed++;
            
            if (completed === queries.length) {
                res.json({
                    success: true,
                    pincode: pincode,
                    data: results
                });
            }
        });
    });
});

// Get top pincodes
router.get('/top/pincodes', (req, res) => {
    const { limit = 20 } = req.query;
    
    const query = `
        SELECT 
            ps.pincode,
            ps.state,
            ps.district,
            ps.total_pensioners,
            ps.total_banks,
            ps.total_branches,
            pm.city
        FROM pincode_statistics ps
        LEFT JOIN pincode_master pm ON ps.pincode = pm.pincode
        ORDER BY ps.total_pensioners DESC
        LIMIT ?
    `;
    
    db.all(query, [parseInt(limit)], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            success: true,
            data: rows
        });
    });
});

module.exports = router;
