const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const { database } = require('../config/database');
const { getStateGeographicAnalysis, getAllAvailableStates } = require('./geographic-analysis-api');
const geographicRoutes = require('./routes/geographic-routes');

const app = express();
const PORT = process.env.PORT || 9007;
const HOST = 'localhost';

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'dlc-portal-jwt-secret-key-2025-secure';

function getDbConnection() {
    const dbInstance = database.getDB();
    return {
        all: dbInstance.all.bind(dbInstance),
        get: dbInstance.get.bind(dbInstance),
        run: dbInstance.run.bind(dbInstance),
        each: dbInstance.each.bind(dbInstance),
        prepare: dbInstance.prepare.bind(dbInstance),
        close: (callback) => {
            if (callback) {
                callback();
            }
        }
    };
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add CORS headers to allow cross-origin requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, AccessToken, accesstoken');
    next();
});

// Mount the geographic routes
app.use('/dlc-pension-data-api/geography', geographicRoutes);

// Middleware to handle double slash issues and proxy path normalization
app.use((req, res, next) => {
    // Normalize double slashes in the URL path
    if (req.url.includes('//')) {
        req.url = req.url.replace(/\/+/g, '/');
    }

    // Strip reverse proxy base path if present
    // e.g., /dlc-pension-data-api/api/central-pensioner-subtypes -> /api/central-pensioner-subtypes
    req.url = req.url.replace(/^\/dlc-pension-data-api(\/|$)/, '/');
    req.originalUrl = (req.originalUrl || '').replace(/^\/dlc-pension-data-api(\/|$)/, '/');

    next();
});

function dbGetMany(db, sqlQueries, params = null) {
    if (params === null) {
        params = [...Array(sqlQueries.length).fill([])];
    }
    if (sqlQueries.length !== params.length) {
        throw new Error("Length of sql_queries and params must be the same");
    }
    const promiseList = sqlQueries.map((query, i) => {
        return new Promise((resolve, reject) => {
            db.get(query, params[i], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    });

    return Promise.all(promiseList);
}

//TODO: to be eventually replaced with dbGetMany
function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row);
        });
    });
}

function buildWhereClauseFromFilters(filters = {}) {
    const whereParts = [];
    const params = [];

    // 1️⃣ Banks
    if (filters.banks && Array.isArray(filters.banks) && filters.banks.length > 0) {
        whereParts.push(`lower(ltrim(rtrim(bank_name))) IN (${filters.banks.map(() => '?').join(',')})`);
        params.push(...filters.banks.map(b => b.toLowerCase()));
    }

    // 2️⃣ State / District / Pincode
    if (filters.state) {
        whereParts.push(`ltrim(rtrim(lower(state))) = ltrim(rtrim(lower(?)))`);
        params.push(filters.state);
    }
    if (filters.district) {
        whereParts.push(`ltrim(rtrim(lower(district))) = ltrim(rtrim(lower(?)))`);
        params.push(filters.district);
    }
    if (filters.pincode) {
        whereParts.push(`ltrim(rtrim(lower(pincode))) = ltrim(rtrim(lower(?)))`);
        params.push(filters.pincode);
    }

    // 3️⃣ Pensioner types and subtypes (use both as a filter, to have right pairs: state autonomous and central autonomous, for example.)
    if (filters.pensioner_types) {
        const pensioner_where_clauses = [];
        const pensioner_params = [];
        Object.keys(filters.pensioner_types).forEach(pensioner_type => {
            const pensioner_subtypes = filters.pensioner_types[pensioner_type];
            if (pensioner_subtypes && pensioner_subtypes.length > 0) {
                const pensioner_type_clause = (`ltrim(rtrim(lower(pensioner_type))) = ? `);
                const pensioner_subtypes_clause = (`ltrim(rtrim(lower(pensioner_subtype))) IN (${pensioner_subtypes.map(() => '?').join(',')})`);
                pensioner_params.push(pensioner_type.toLowerCase());
                pensioner_subtypes.forEach(subtype => {
                    pensioner_params.push(subtype.toLowerCase());
                });
                const where_clause = `(${pensioner_type_clause} AND ${pensioner_subtypes_clause})`;
                pensioner_where_clauses.push(where_clause);
            }
        });
        if (pensioner_where_clauses.length > 0) {
            const or_joined_pensioner_type_filters = `(${pensioner_where_clauses.join(' OR ')})`;
            whereParts.push(or_joined_pensioner_type_filters);
            params.push(...pensioner_params);
        }
    }

    // 4️⃣ Age groups (translate each group into a YOB range condition)
    const currentYear = new Date().getFullYear();
    if (filters.age_groups && Array.isArray(filters.age_groups) && filters.age_groups.length > 0) {
        const ageConditions = [];

        filters.age_groups.forEach((group) => {
            switch (group) {
                case "Below 60":
                    ageConditions.push(`(${currentYear} - CAST(YOB AS INTEGER) < 60)`);
                    break;
                case "60–70":
                    ageConditions.push(`(${currentYear} - CAST(YOB AS INTEGER) BETWEEN 60 AND 69)`);
                    break;
                case "70–80":
                    ageConditions.push(`(${currentYear} - CAST(YOB AS INTEGER) BETWEEN 70 AND 79)`);
                    break;
                case "80–90":
                    ageConditions.push(`(${currentYear} - CAST(YOB AS INTEGER) BETWEEN 80 AND 89)`);
                    break;
                case "Above 90":
                    ageConditions.push(`(${currentYear} - CAST(YOB AS INTEGER) >= 90)`);
                    break;
            }
        });

        if (ageConditions.length > 0) {
            whereParts.push(`(${ageConditions.join(' OR ')})`);
        }
    }

    // 5️⃣ Data status
    if (filters.data_status && filters.data_status !== "All") {
        if (filters.data_status === "Completed") {
            whereParts.push(`LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != ''`);
        } else if (filters.data_status === "Pending") {
            whereParts.push(`LC_date IS NULL OR LTRIM(RTRIM(LC_date)) = ''`);
        } else if (filters.data_status === "Last year manual") {
            whereParts.push(`lower(last_year_lc) = 'plc'`); // Example condition
        }
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    return { whereClause, params };
}


async function getDashboardStats(filters = {}) {
    const db = getDbConnection();
    const summaryStats = {
        total_pensioners: null,
        dlc_done: null,
        dlc_pending: null,
        dlc_percentage: null,
        dlc_done_yesterday: null,
        data_accuracy: null
    }

    // Comprehensive age distribution from all tables
    const ageStats = {
        '<60 Years': { total: null, dlc_done: null },
        '60-70 Years': { total: null, dlc_done: null },
        '70-80 Years': { total: null, dlc_done: null },
        '80-90 Years': { total: null, dlc_done: null },
        '90+ Years': { total: null, dlc_done: null }
    };

    const currentYear = new Date().getFullYear();

    const today = new Date();
    const yesterdaydt = new Date(today); // Create a copy to avoid modifying 'today'
    yesterdaydt.setDate(today.getDate() - 1);
    const yesterday = yesterdaydt.toISOString().split('T')[0]

    const { whereClause, params } = buildWhereClauseFromFilters(filters);
    const filterWithoutWhere = whereClause ? whereClause.replace(/^WHERE\s+/i, '') : '';
    const ageFilterClause = filterWithoutWhere ? `AND (${filterWithoutWhere})` : '';
    const _ageWiseBreakdownQuery = `
            SELECT 
                SUM(CASE WHEN ${currentYear} - year_val < 60 THEN 1 ELSE 0 END) AS age_under_60,
                SUM(CASE WHEN ${currentYear} - year_val BETWEEN 60 AND 69 THEN 1 ELSE 0 END) AS age_60_70,
                SUM(CASE WHEN ${currentYear} - year_val BETWEEN 70 AND 79 THEN 1 ELSE 0 END) AS age_70_80,
                SUM(CASE WHEN ${currentYear} - year_val BETWEEN 80 AND 89 THEN 1 ELSE 0 END) AS age_80_90,
                SUM(CASE WHEN ${currentYear} - year_val >= 90 THEN 1 ELSE 0 END) AS age_90_plus
            FROM (
                SELECT CAST(TRIM(YOB) AS UNSIGNED) AS year_val
                FROM all_pensioners 
                WHERE YOB IS NOT NULL 
                    AND TRIM(YOB) REGEXP '^[0-9]{4}$'
                    AND CAST(TRIM(YOB) AS UNSIGNED) BETWEEN 1900 AND ${currentYear}
                    ${ageFilterClause}
            ) AS ages
                `;

    const _summaryStatsQuery = ` 
            WITH cte_all_pensioners_with_dlc_done_flag AS (
                SELECT *, 
                    CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != '' THEN 1 ELSE 0 END AS dlc_done_flag
                FROM all_pensioners
            )
            SELECT
                COUNT(*) AS total_pensioners,
                SUM(dlc_done_flag) AS dlc_done,
                SUM(CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) = '${yesterday}' THEN 1 ELSE 0 END) AS dlc_done_yesterday,
                COUNT(*) - SUM(dlc_done_flag) AS dlc_pending,
                (SUM(dlc_done_flag) * 100.0 / COUNT(*)) AS dlc_completion_ratio
            FROM  cte_all_pensioners_with_dlc_done_flag ${whereClause}`;


    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const [statsRow, ageWiseBreakdownRow] =
            await dbGetMany(db, [_summaryStatsQuery, _ageWiseBreakdownQuery], [params, params]);

        ageStats['<60 Years'] = ageWiseBreakdownRow?.age_under_60 || 0;
        ageStats['60-70 Years'] = ageWiseBreakdownRow?.age_60_70 || 0;
        ageStats['70-80 Years'] = ageWiseBreakdownRow?.age_70_80 || 0;
        ageStats['80-90 Years'] = ageWiseBreakdownRow?.age_80_90 || 0;
        ageStats['90+ Years'] = ageWiseBreakdownRow?.age_90_plus || 0;

        summaryStats.total_pensioners = statsRow?.total_pensioners || 0;
        summaryStats.dlc_done = statsRow?.dlc_done || 0;
        summaryStats.dlc_percentage = Math.round(10000*summaryStats.dlc_done/summaryStats.total_pensioners)/100 || 0.00;
        summaryStats.dlc_pending = statsRow?.dlc_pending || 0;
        summaryStats.dlc_completion_ratio = statsRow?.dlc_completion_ratio || 0;
        summaryStats.dlc_done_yesterday = statsRow?.dlc_done_yesterday || 0;
        summaryStats.data_accuracy = statsRow?.data_accuracy || "Coming soon";

        return {
            summaryStats,
            ageStats
        };

    }
    catch (err) {
        console.log("Could not fetch dashboard statistics: ", err);
        throw err;
    }
    finally {
        closeDb();
    }
}


async function getTopStates(limit) {
    const db = getDbConnection();

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Use only all_pensioners for both totals and verified (LC_date)

        let query = `select lower(ltrim(rtrim(state))) as state, 
        count(*) as all_pensioner_count, 
        SUM(CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != '' THEN 1 ELSE 0 END) AS verified_pensioner_count,
        (SUM(CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != '' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) * 100 AS completion_ratio
        from all_pensioners 
        where state is Not null and State != 'null' 
        GROUP by lower(ltrim(rtrim(state))) order by completion_ratio desc, all_pensioner_count desc`;
        query = _addLimitClauseIfNeeded(query, limit)

        const rows = await new Promise((resolve, reject) => {

            db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        merged = []

        rows.forEach(r => {
            merged.push({
                state: r.state,
                all_pensioner_count: r.all_pensioner_count,
                verified_pensioner_count: r.verified_pensioner_count,
                completion_ratio: r.all_pensioner_count > 0 ? Number(((r.verified_pensioner_count * 100.0) / r.all_pensioner_count).toFixed(2)) : 0

            });
        });

        return merged;
    }
    catch (err) {
        console.warn('Top states by verified pensioners query failed:', err.message);
        return [];
    }
    finally {
        closeDb();
    }
}

async function getStateWisePensionerStats() {
    const db = getDbConnection();

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Query to get state-wise statistics
        const query = `
            SELECT 
                pensioner_state as state,
                COUNT(*) as total,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as pending
            FROM doppw_pensioner_data
            WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'
            GROUP BY pensioner_state
            ORDER BY total DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Calculate completion percentage for each state
                    const statsWithPercentage = rows.map(row => {
                        const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                        return {
                            ...row,
                            completionPercentage: parseFloat(completionPercentage)
                        };
                    });
                    resolve(statsWithPercentage);
                }
            });
        });
    } finally {
        closeDb();
    }
}

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token.'
            });
        }

        // Check if session is still valid
        if (decoded.maxSessionEnd && Date.now() > decoded.maxSessionEnd) {
            return res.status(401).json({
                success: false,
                message: 'Session expired'
            });
        }

        req.user = decoded;
        next();
    });
};

// Dashboard top cards, and age-wise statistics on the right.
app.post('/api/dashboard/public-stats', async (req, res) => {
    try {
        const filters = req.body?.filters || {};
        const stats = await getDashboardStats(filters);
        res.status(200).json({
            success: true,
            ...stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard statistics'
        });
    }
});

app.post('/api/top-states', async (req, res) => {
    try {
        const limit = req.body.limit;
        const filters = req.body.filters;
        const topStates = await getTopStates(limit);
        res.status(200).json({
            success: true,
            data: topStates,
            totalStates: topStates.length,
            dataSources: ['all_pensioners']
        });
    } catch (error) {
        console.error('Error in /api/top-states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top states data'
        });
    }
});




// Authentication Methods Analysis Function
async function getAuthenticationMethodsAnalysis(filters) {
    const db = getDbConnection();

    const _closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Get authentication methods data from submission_mode column
        const { whereClause, params } = buildWhereClauseFromFilters(filters);
        const query = `SELECT 
                            CASE 
                                WHEN LOWER(TRIM(pensioner_DLC_type)) IN ('p', 'f', 'i') THEN LOWER(TRIM(pensioner_DLC_type))
                                ELSE 'other'
                            END AS pensioner_DLC_type,
                            COUNT(*) AS count
                            FROM all_pensioners
                            WHERE lc_date IS NOT NULL 
                            AND TRIM(lc_date) != '' ${whereClause}
                            GROUP BY 
                            CASE 
                                WHEN LOWER(TRIM(pensioner_DLC_type)) IN ('p', 'f', 'i') THEN LOWER(TRIM(pensioner_DLC_type))
                                ELSE 'other'
                            END
                            ORDER BY count DESC;`
        const rows = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        const auth_methods = { "face": 0, "iris": 0, "fingerprint": 0, "other": 0 };
        rows.forEach(row => {
            const _methodMapping = {
                'i': 'iris',
                'f': 'face',
                'p': 'fingerprint',
                'other': 'other'
            };
            const methodName = _methodMapping[row.pensioner_DLC_type.toLowerCase()] || "other";
            auth_methods[methodName] = row.count;
        });
        return auth_methods;

    } catch (err) {
        console.error('Error fetching authentication methods analysis:', err, filters);
    }
    finally {
        _closeDb();
    }
}

// Public API endpoint for authentication methods analysis
// TODO: SSR
app.post('/api/dashboard/authentication-methods', async (req, res) => {
    try {
        const filters = req.query.filters || {};
        console.log("Received request for /api/dashboard/authentication-methods with filters:", filters);
        const authData = await getAuthenticationMethodsAnalysis(filters);
        res.status(200).json({
            data: authData
        });
    } catch (error) {
        console.error('Error in /api/dashboard/authentication-methods:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch authentication methods data'
        });
    }
});

// Protected authentication methods endpoint
app.get('/api/dashboard/auth-methods', authenticateToken, async (req, res) => {
    try {
        const authData = await getAuthenticationMethodsAnalysis(req.query.filters || {});
        res.status(200).json({
            success: true,
            ...authData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/dashboard/auth-methods:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch authentication methods data'
        });
    }
});

// Advanced Certificate & Authentication Analysis with Filtering
async function getAdvancedCertificateAnalysis(filters = {}) {
    const db = getDbConnection();

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const { ageGroup, state, certificateType, timeRange, status } = filters;

        // Build dynamic WHERE clause based on filters
        let whereConditions = [];
        let params = [];

        // Base condition - only add submission_mode filter if certificateType is specified
        if (certificateType && certificateType !== 'All') {
            whereConditions.push("submission_mode IS NOT NULL AND submission_mode != 'nan'");
        }

        // Age group filter
        if (ageGroup) {
            if (ageGroup === 'Below 60') {
                whereConditions.push("age < 60");
            } else if (ageGroup === '60-70') {
                whereConditions.push("age >= 60 AND age <= 70");
            } else if (ageGroup === '70-80') {
                whereConditions.push("age > 70 AND age <= 80");
            } else if (ageGroup === '80-90') {
                whereConditions.push("age > 80 AND age <= 90");
            } else if (ageGroup === 'Above 90') {
                whereConditions.push("age > 90");
            }
        }

        // State filter
        if (state && state !== 'All') {
            whereConditions.push("UPPER(pensioner_state) = UPPER(?)");
            params.push(state);
        }

        // Certificate type filter
        if (certificateType && certificateType !== 'All') {
            const typeMap = {
                'Digital': 'DLC',
                'Physical': 'PLC',
                'Video': 'VLC'
            };
            const mappedType = typeMap[certificateType];
            if (mappedType) {
                whereConditions.push("submission_mode = ?");
                params.push(mappedType);
            }
        }

        // Time range filter (based on certificate_submission_date)
        if (timeRange && timeRange !== 'All') {
            if (timeRange === '7days') {
                whereConditions.push("certificate_submission_date >= DATE('now', '-7 days')");
            } else if (timeRange === '30days') {
                whereConditions.push("certificate_submission_date >= DATE('now', '-30 days')");
            } else if (timeRange === '90days') {
                whereConditions.push("certificate_submission_date >= DATE('now', '-90 days')");
            }
        }

        // Status filter
        if (status && status !== 'All') {
            if (status === 'Completed') {
                whereConditions.push("submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED')");
            } else if (status === 'Pending') {
                whereConditions.push("(submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED'))");
            }
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Main query for certificate analysis with filters
        const mainQuery = `
            SELECT 
                submission_mode,
                COUNT(*) as total_count,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as failed_count,
                AVG(age) as avg_age
            FROM doppw_pensioner_data
            ${whereClause}
            GROUP BY submission_mode
            ORDER BY total_count DESC
        `;

        const certificateData = await new Promise((resolve, reject) => {
            db.all(mainQuery, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Age group distribution query
        const ageDistributionQuery = `
            SELECT 
                submission_mode,
                CASE 
                    WHEN age < 60 THEN '<60'
                    WHEN age >= 60 AND age <= 70 THEN '60-70'
                    WHEN age > 70 AND age <= 80 THEN '70-80'
                    WHEN age > 80 AND age <= 90 THEN '80-90'
                    WHEN age > 90 THEN '>90'
                    ELSE 'Unknown'
                END as age_group,
                COUNT(*) as count
            FROM doppw_pensioner_data
            ${whereClause}
            GROUP BY submission_mode, age_group
            ORDER BY submission_mode, age_group
        `;

        const ageDistribution = await new Promise((resolve, reject) => {
            db.all(ageDistributionQuery, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // State-wise distribution query
        const stateDistributionQuery = `
            SELECT 
                submission_mode,
                pensioner_state,
                COUNT(*) as count,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_count
            FROM doppw_pensioner_data
            ${whereClause}
            GROUP BY submission_mode, pensioner_state
            ORDER BY submission_mode, count DESC
        `;

        const stateDistribution = await new Promise((resolve, reject) => {
            db.all(stateDistributionQuery, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Process and format the data
        const methodMapping = {
            'DLC': 'Digital',
            'PLC': 'Physical',
            'VLC': 'Video'
        };

        const processedData = {
            certificateTypes: {},
            ageDistribution: {},
            stateDistribution: {},
            summary: {
                totalRecords: 0,
                totalSuccess: 0,
                totalFailed: 0,
                overallSuccessRate: 0
            }
        };

        // Process main certificate data
        certificateData.forEach(row => {
            const methodName = methodMapping[row.submission_mode] || row.submission_mode;
            const successRate = row.total_count > 0 ? ((row.success_count / row.total_count) * 100).toFixed(2) : 0;

            processedData.certificateTypes[methodName] = {
                total: row.total_count,
                success: row.success_count,
                failed: row.failed_count,
                successRate: parseFloat(successRate),
                avgAge: row.avg_age ? parseFloat(row.avg_age.toFixed(1)) : 0
            };

            processedData.summary.totalRecords += row.total_count;
            processedData.summary.totalSuccess += row.success_count;
            processedData.summary.totalFailed += row.failed_count;
        });

        // Calculate overall success rate
        processedData.summary.overallSuccessRate = processedData.summary.totalRecords > 0 ?
            parseFloat(((processedData.summary.totalSuccess / processedData.summary.totalRecords) * 100).toFixed(2)) : 0;

        // Process age distribution
        ageDistribution.forEach(row => {
            const methodName = methodMapping[row.submission_mode] || row.submission_mode;
            if (!processedData.ageDistribution[methodName]) {
                processedData.ageDistribution[methodName] = {};
            }
            processedData.ageDistribution[methodName][row.age_group] = row.count;
        });

        // Process state distribution (top 10 per method)
        const stateGroups = {};
        stateDistribution.forEach(row => {
            const methodName = methodMapping[row.submission_mode] || row.submission_mode;
            if (!stateGroups[methodName]) {
                stateGroups[methodName] = [];
            }
            stateGroups[methodName].push({
                state: row.pensioner_state,
                total: row.count,
                verified: row.verified_count,
                verificationRate: row.count > 0 ? parseFloat(((row.verified_count / row.count) * 100).toFixed(2)) : 0
            });
        });

        // Keep top 10 states per method
        Object.keys(stateGroups).forEach(method => {
            processedData.stateDistribution[method] = stateGroups[method].slice(0, 10);
        });

        return {
            ...processedData,
            filtersApplied: filters,
            dataSource: 'doppw_pensioner_data'
        };
    } finally {
        closeDb();
    }
}

// Advanced Certificate Analysis API with comprehensive filtering
app.get('/api/dashboard/advanced-certificate-analysis', async (req, res) => {
    try {
        const filters = {
            ageGroup: req.query.ageGroup || 'All',
            state: req.query.state || 'All',
            certificateType: req.query.certificateType || 'All',
            timeRange: req.query.timeRange || 'All',
            status: req.query.status || 'All'
        };

        const analysisData = await getAdvancedCertificateAnalysis(filters);

        res.status(200).json({
            success: true,
            ...analysisData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/dashboard/advanced-certificate-analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch advanced certificate analysis data'
        });
    }
});

// Get available filter options for certificate analysis
app.get('/api/dashboard/certificate-filter-options', async (req, res) => {
    try {
        const db = getDbConnection();

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get available states
            const states = await new Promise((resolve, reject) => {
                const query = `
                    SELECT DISTINCT pensioner_state as state
                    FROM doppw_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'
                        AND submission_mode IS NOT NULL AND submission_mode != 'nan'
                    ORDER BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(['All', ...rows.map(row => row.state)]);
                    }
                });
            });

            // Get available certificate types
            const certificateTypes = await new Promise((resolve, reject) => {
                const query = `
                    SELECT DISTINCT submission_mode
                    FROM doppw_pensioner_data
                    WHERE submission_mode IS NOT NULL AND submission_mode != 'nan'
                    ORDER BY submission_mode
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const typeMapping = {
                            'DLC': 'Digital',
                            'PLC': 'Physical',
                            'VLC': 'Video'
                        };
                        const types = rows.map(row => typeMapping[row.submission_mode] || row.submission_mode);
                        resolve(['All', ...types]);
                    }
                });
            });

            res.status(200).json({
                success: true,
                filterOptions: {
                    states: states,
                    certificateTypes: certificateTypes,
                    ageGroups: ['All', '<60', '60-70', '70-80', '80-90', '>90'],
                    timeRanges: ['All', '7days', '30days', '90days'],
                    statusOptions: ['All', 'Completed', 'Pending']
                }
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/dashboard/certificate-filter-options:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch certificate filter options'
        });
    }
});

app.post('/api/geo-stats', async (req, res) => {
    const params = req.body;
    const level = params.level || 'state';
    const name = params.name || null;
    const filters = params.filters || {};

    const geoStats = await fetchGeoStatistics(level, name, filters);

    return res.json({
        "data": {
            level: level,
            name: name,
            geoStats: geoStats
        }
    });
});

async function fetchGeoStatistics(level, name, filters) {
    const { whereClause, params } = buildWhereClauseFromFilters(filters);
    const levelColumn = level === ' country' ? 'state' :
        level === 'state' ? 'district' :
            level === 'district' ? `fixed_pincode` : //using a CTE with this derived column, see query below
                'state'; // fallback default

    const query = `
  with  all_pensioners_fixed_pincode as 
  (
    select *, 
    COALESCE(NULLIF(LTRIM(RTRIM(pensioner_pincode)), ''), LTRIM(RTRIM(branch_pincode))) as fixed_pincode
    from all_pensioners
  )
  SELECT
        ${levelColumn} AS name,
        COUNT(*) AS total_pensioners,
        SUM(CASE WHEN lc_date IS NOT NULL THEN 1 ELSE 0 END) AS dlc_done,
        SUM(CASE WHEN lc_date IS NULL THEN 1 ELSE 0 END) AS dlc_pending,
        SUM(
            CASE
                WHEN lc_date IS NULL AND last_year_lc_type = 'DLC'
                THEN 0 ELSE 1
            END
        ) AS conversion_potential
    FROM all_pensioners_fixed_pincode
    ${whereClause}
    GROUP BY ${levelColumn};
  `;
    
  const db = getDbConnection();
    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        const geoStats = rows.map(row => ({
                name: row.name || 'Unknown',
                total_pensioners: row.total_pensioners || 0,
                dlc_done: row.dlc_done || 0,
                dlc_pending: row.dlc_pending || 0,
                conversion_potential: row.conversion_potential || 0
            }));
            return geoStats;
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            success: false,
            error: 'Database query failed:', query,
            details: error.message
        });
    } finally {
        closeDb();
    }
}

// Authentication utilities
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateJWTToken(user, sessionToken) {
    const payload = {
        userId: user.id || 1,
        username: user.username,
        sessionToken: sessionToken,
        loginTime: Date.now(),
        maxSessionEnd: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
        aud: 'pension-users',
        iss: 'dlc-pension-dashboard'
    };

    return jwt.sign(payload, JWT_SECRET);
}

// Middleware to parse JSON bodies
app.use(express.json());

// Login endpoint - connects to external API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        console.log(`Login attempt for user: ${username}`);

        // Use local database authentication first
        const db = getDbConnection();

        const query = `SELECT id, username, password, role FROM users WHERE username = ?`;
        db.get(query, [username], (err, row) => {
            db.close();

            if (err) {
                console.error('Database error:', err.message);
                return res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }

            if (!row) {
                console.log(`User not found: ${username}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password'
                });
            }

            // Check password (in production, use bcrypt for hashed passwords)
            if (row.password !== password) {
                console.log(`Invalid password for user: ${username}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password'
                });
            }

            // Local authentication successful
            const sessionToken = generateSessionToken();
            const jwtToken = generateJWTToken(row, sessionToken);

            console.log(`Local login successful for user: ${username}`);

            // Note: Could update last login time if column exists

            res.status(200).json({
                success: true,
                message: 'Login successful',
                user: {
                    id: row.id,
                    username: row.username,
                    role: row.role
                },
                token: jwtToken
            });
        });
    } catch (error) {
        console.error('Error in /api/auth/login:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Token verification endpoint
app.post('/api/auth/verify', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired token'
                });
            }

            // Check if session is still valid
            if (decoded.maxSessionEnd && Date.now() > decoded.maxSessionEnd) {
                return res.status(401).json({
                    success: false,
                    message: 'Session expired'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Token is valid',
                user: {
                    id: decoded.userId,
                    username: decoded.username,
                    sessionToken: decoded.sessionToken
                }
            });
        });
    } catch (error) {
        console.error('Error in /api/auth/verify:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});



// Top Banks API - Get banks with highest verification counts
app.post('/api/top-banks', async (req, res) => {

    const limit = req.body.limit ? parseInt(req.body.limit) : null;
    const filters = req.body.filters;

    const { whereClause, params } = buildWhereClauseFromFilters(filters);
    const _limitClauseFromLimit = limit ? `LIMIT ${limit}` : '';


    let query = `select ltrim(rtrim(lower(Bank_name))) as bank_name, 
    count(*) as all_pensioner_count, 
    count(LC_date) as verified_pensioner_count, 
    (count(LC_date) * 1.0 / count(*)) * 100 as completion_ratio
    from all_pensioners where bank_name is not null ${whereClause ? whereClause.replace("WHERE", 'AND') : ''}
    GROUP by bank_name
    order by completion_ratio desc, all_pensioner_count desc
    ${_limitClauseFromLimit}`;

    const db = getDbConnection();

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        res.json({
            success: true,
            data: rows,
            message: `Top ${limit} banks by verified pensioner count`
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            success: false,
            error: 'Database query failed:', query,
            details: error.message
        });
    } finally {
        closeDb();
    }
});


// Mount Excel Analyzer API routes

// Start server
app.listen(PORT, HOST, () => {
    console.log(`SBI EIS GEN 6 Server listening on ${HOST}:${PORT}`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
    console.log(`\n📊 EXCEL MAPPER (NEW):`);
    console.log(`🗂️  Excel to Database Mapper: http://${HOST}:${PORT}/excel-mapper.html`);
    console.log(`📁 List Excel Files: http://${HOST}:${PORT}/api/excel/files`);
    console.log(`🔍 Analyze Excel: http://${HOST}:${PORT}/api/excel/analyze`);
    console.log(`💾 Create Database: http://${HOST}:${PORT}/api/excel/create-database`);
    console.log(`\n🌍 NEW GEOGRAPHIC ANALYSIS APIs:`);
    console.log(`📍 State Analysis: http://${HOST}:${PORT}/api/geographic/state-analysis/:stateName`);
    console.log(`📋 Available States: http://${HOST}:${PORT}/api/geographic/available-states`);
    console.log(`⚡ Quick Summary: http://${HOST}:${PORT}/api/geographic/quick-summary/:stateName`);
    console.log(`🏛️  District Details: http://${HOST}:${PORT}/api/geographic/district-details/:stateName/:districtName`);
    console.log(`\n🏦 NEW BANK ANALYSIS APIs:`);
    console.log(`📊 Bank Analysis: http://${HOST}:${PORT}/api/bank-analysis`);
    console.log(`🏆 Top Banks: http://${HOST}:${PORT}/api/top-banks`);
    console.log(`🔍 Bank Details: http://${HOST}:${PORT}/api/bank-details/:bankName`);
    console.log(`🗺️  State Bank Distribution: http://${HOST}:${PORT}/api/state-bank-distribution`);
    console.log(`\n🗺️  ENHANCED CHOROPLETH MAP APIs:`);
    console.log(`🎨 State Verification Data: http://${HOST}:${PORT}/api/choropleth/state-verification-data`);
    console.log(`⚡ Simple Map Data: http://${HOST}:${PORT}/api/choropleth/simple-map-data`);
    console.log(`🏛️  Enhanced State Bank Summary: http://${HOST}:${PORT}/api/choropleth/state-bank-summary/:stateName`);
    console.log(`🏦 NEW: Comprehensive Bank Data: http://${HOST}:${PORT}/api/choropleth/comprehensive-bank-data`);
    console.log(`   🔗 Combined Filters: /api/choropleth/comprehensive-bank-data?state=Maharashtra&bank_name=SBI&min_pensioners=500`);
    console.log(`\n📍 NEW PINCODE-WISE APIs:`);
    console.log(`🏘️  Detailed Lists: http://${HOST}:${PORT}/api/geography/detailed-lists/:stateName?type=pincodes&limit=1000`);
    console.log(`📮 Pincode Summary: http://${HOST}:${PORT}/api/geography/pincode-summary/:stateName`);
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
});

module.exports = {
    // generateDynamicKey,
    // encryptPayload,
    // decryptPayload,
    // encryptAESKeyWithRSAPublicKey,
    // decryptAESKeyWithRSAPrivateKey,
    // createDigitalSignature,
    // verifyDigitalSignature,
    // processIncomingRequest,
    // prepareOutgoingRequest,
    getDashboardStats
};

// SBI API Integration - Final Working Version
// const SBIResponseHandler = require('./sbi-response-handler');

// SBI API endpoints temporarily commented out
/*
// SBI API endpoint - Get Batch ID
app.post('/api/sbi/get-batch-id', async (req, res) => {
    // Implementation commented out for now
});
 
// SBI API endpoint - Fetch Verification Records  
app.post('/api/sbi/fetch-records', async (req, res) => {
    // Implementation commented out for now
});
 
// SBI API endpoint - Combined endpoint
app.post('/api/sbi/get-verification-data', async (req, res) => {
    // Implementation commented out for now
});
*/

// ============================================================================
// TOP BANKS ANALYSIS API FOR CHOROPLETH
// ============================================================================

// Top Banks Analysis for State Verification Data
app.get('/api/choropleth/top-banks-analysis', async (req, res) => {
    const {
        state_filter,     // specific state name
        limit = 10,       // number of top banks to return
        include_branches = 'false'  // include branch details
    } = req.query;

    const db = getDbConnection();

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Build state filter condition
        let stateFilter = '';
        let stateParams = [];

        if (state_filter && state_filter !== 'all') {
            stateFilter = 'WHERE UPPER(bank_state) LIKE UPPER(?)';
            stateParams.push(`%${state_filter}%`);
        }

        // Get top banks from bank_pensioner_data
        let topBanksQuery = `
            select Bank_name, count(*) as all_pensioner_count, count(LC_date) as verified_pensioner_count, 
(count(LC_date) * 1.0 / count(*)) * 100 as completion_ratio
from all_pensioners where bank_name is Not null and bank_name != 'null' GROUP by bank_name order by completion_ratio desc limit 5
        `;

        const topBanks = await new Promise((resolve, reject) => {
            db.all(topBanksQuery, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

    } catch (error) {
        console.error('Error in top banks analysis API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top banks analysis',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

// ============================================================================
// PINCODE-BASED PENSIONER DATA API
// ============================================================================

// Import pincode API routes
const pincodeApiRouter = require('./pincode-api');
// const { cache } = require('react');
const { isNullOrUndefined } = require('util');
const constants = require('constants');
const { Console } = require('console');
app.use('/api/pincode', pincodeApiRouter);

const _addLimitClauseIfNeeded = (query, limit) => {
    query = query.trim();
    if (limit && !query.toLowerCase().includes('limit')) {
        query += ` LIMIT ` + limit;
    }
    return query;
};

// Helper: Get top pensioner types
async function getTopPSA(filters, limit) {
    const { whereClause, params } = buildWhereClauseFromFilters(filters);
    let query = `
            select ltrim(rtrim(lower(pensioner_type))) as psa,
                    count(*) as all_pensioner_count, 
                    COUNT(LC_date) AS verified_pensioner_count,
                    ROUND(COUNT(LC_date) * 100.0 / COUNT(*), 2) AS completion_ratio
                    from all_pensioners ${whereClause}
                    group by ltrim(rtrim(lower(pensioner_type)))
                    order by completion_ratio desc, all_pensioner_count desc`;

    query = _addLimitClauseIfNeeded(query, limit);

    return new Promise((resolve, reject) => {

        const db = getDbConnection();

        db.all(query, params, (err, rows) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// Helper: Count distinct central PSA subtype counts
async function getTopCentralPensionerSubtypeCounts(filters, limit) {
    return new Promise((resolve, reject) => {
        const db = getDbConnection();
        const { whereClause, params } = buildWhereClauseFromFilters(filters);
        const whereClauseCorrected = (whereClause && whereClause.trim().length > 0) ?
            whereClause.replace("WHERE", "AND") : "";

        let query = `
                    SELECT
                        pensioner_subtype,COUNT(*) AS all_pensioner_count,
                        COUNT(LC_date) AS verified_pensioner_count,
                        (COUNT(LC_date) * 100.0 / COUNT(*)) AS completion_ratio
                    FROM
                        all_pensioners
                    WHERE
                        ltrim(rtrim(lower(pensioner_type))) = lower('CENTRAL')
                        ${whereClauseCorrected}
                    GROUP BY
                        pensioner_subtype
                    ORDER BY
                        completion_ratio DESC, all_pensioner_count DESC
                    `;

        query = _addLimitClauseIfNeeded(query, limit);
        db.all(query, params, (err, rows) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

// Top PSA Categories API endpoint
app.post('/api/top-psas', async (req, res) => {
    try {
        const limit = req.body.limit || null;
        const filters = req.body.filters || {};
        const topPSA = await getTopPSA(filters, limit);


        res.status(200).json({
            success: true,
            data: topPSA,
            totalPSA: topPSA.length,
            filters: {
            },
            dataSources: ['all_pensioners']
        });
    } catch (error) {
        console.error('Error in /api/top-psas:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top PSA data'
        });
    }
});

app.post('/api/top-central-pensioner-subtypes', async (req, res) => {
    try {
        const limit = req.body.limit;
        const filters = req.body.filters || {};
        const data = await getTopCentralPensionerSubtypeCounts(filters, limit);
        res.status(200).json({
            success: true,
            data,
            totalTypes: data.length,
            dataSources: ['all_pensioners']
        });
    } catch (error) {
        console.error('Error in /api/top-central-pensioner-subtypes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top central pensioner subtype completion stats'
        });
    }
});

// Server already started above - no need for duplicate listen call
