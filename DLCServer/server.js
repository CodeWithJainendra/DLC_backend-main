const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const { getStateGeographicAnalysis, getAllAvailableStates } = require('./geographic-analysis-api');
const geographicRoutes = require('./routes/geographic-routes');

const app = express();
const PORT = process.env.PORT || 9007;
const HOST = 'localhost';
// const DB_PATH = path.join(__dirname, 'database.db');
//TODO: changes
const DB_PATH = path.join("..", 'updated_db/updated_db.db');



// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'dlc-portal-jwt-secret-key-2025-secure';

// Global database connection for tracking
const globalDb = new sqlite3.Database(DB_PATH);

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

// Load certificates
const sbiCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'ENC_EIS_UAT.cer'), 'utf8');
const ourCertificate = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.cer'), 'utf8');
const ourPrivateKey = fs.readFileSync(path.join(__dirname, 'certificates', 'samar.iitk.ac.in.key'), 'utf8');

// Convert certificates to forge objects
const sbiCert = forge.pki.certificateFromPem(sbiCertificate);
const ourCert = forge.pki.certificateFromPem(ourCertificate);
const ourPrivKey = forge.pki.privateKeyFromPem(ourPrivateKey);

// Utility functions for SBI EIS GEN 6 implementation

/**
 * Generate a 32-character dynamic key for AES encryption
 * @returns {string} 32-character key
 */
function generateDynamicKey() {
    // As per specification, we should not use Key generator function
    // Instead, we generate a 32-character key using keyboard characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Encrypt payload using AES-GCM with the provided key
 * @param {string} plaintext - The plaintext to encrypt
 * @param {string} key - The 32-character AES key
 * @returns {object} Encrypted data and IV
 */
function encryptPayload(plaintext, key) {
    try {
        // Convert key to buffer (32 bytes for AES-256)
        const keyBuffer = Buffer.from(key, 'utf8');
        // Use first 12 bytes of key as IV as per specification
        const iv = keyBuffer.subarray(0, 12);

        // Create cipher using the correct method
        const cipher = crypto.createCipherGCM('aes-256-gcm', keyBuffer, iv);

        // Encrypt the plaintext
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Get the authentication tag (16 bytes as per specification)
        const authTag = cipher.getAuthTag();

        return {
            encryptedData: encrypted,
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64')
        };
    } catch (error) {
        // Fallback for older Node.js versions
        const algorithm = 'aes-256-gcm';
        const keyBuffer = Buffer.from(key, 'utf8');
        const iv = keyBuffer.subarray(0, 12);

        const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const authTag = cipher.getAuthTag();

        return {
            encryptedData: encrypted,
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64')
        };
    }
}

/**
 * Decrypt payload using AES-GCM with the provided key
 * @param {string} encryptedData - The encrypted data
 * @param {string} key - The 32-character AES key
 * @param {string} ivBase64 - The IV in base64
 * @param {string} authTagBase64 - The auth tag in base64
 * @returns {string} Decrypted plaintext
 */
function decryptPayload(encryptedData, key, ivBase64, authTagBase64) {
    try {
        // Convert key to buffer
        const keyBuffer = Buffer.from(key, 'utf8');

        // Convert IV and auth tag from base64
        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');

        // Create decipher
        const decipher = crypto.createDecipherGCM('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(authTag);

        // Decrypt the data
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Fallback for older Node.js versions
        const algorithm = 'aes-256-gcm';
        const keyBuffer = Buffer.from(key, 'utf8');
        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');

        const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}

/**
 * Encrypt the AES key using SBI's public key with RSA
 * @param {string} aesKey - The AES key to encrypt
 * @returns {string} Encrypted AES key in base64
 */
function encryptAESKeyWithRSAPublicKey(aesKey) {
    try {
        // Get SBI's public key from certificate
        const sbiPublicKey = sbiCert.publicKey;

        // Encrypt the AES key using RSA-OAEP with SHA-256
        const encryptedKey = sbiPublicKey.encrypt(aesKey, 'RSA-OAEP', {
            md: forge.md.sha256.create()
        });

        // Return as base64
        return forge.util.encode64(encryptedKey);
    } catch (error) {
        console.error('Error in encryptAESKeyWithRSAPublicKey:', error);
        throw error;
    }
}

/**
 * Decrypt the AES key using our private key with RSA
 * @param {string} encryptedAESKeyBase64 - The encrypted AES key in base64
 * @returns {string} Decrypted AES key
 */
function decryptAESKeyWithRSAPrivateKey(encryptedAESKeyBase64) {
    try {
        // Decode from base64
        const encryptedKey = forge.util.decode64(encryptedAESKeyBase64);

        // Decrypt using our private key with RSA-OAEP and SHA-256
        const decryptedKey = ourPrivKey.decrypt(encryptedKey, 'RSA-OAEP', {
            md: forge.md.sha256.create()
        });

        return decryptedKey;
    } catch (error) {
        console.error('Error in decryptAESKeyWithRSAPrivateKey:', error);
        throw error;
    }
}

/**
 * Create digital signature using SHA256 with RSA
 * @param {string} data - The data to sign
 * @returns {string} Digital signature in base64
 */
function createDigitalSignature(data) {
    try {
        // Create SHA256 hash
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');

        // Sign with our private key using PKCS#1 v1.5 padding
        const signature = ourPrivKey.sign(md, 'RSASSA-PKCS1-V1_5');

        // Return as base64
        return forge.util.encode64(signature);
    } catch (error) {
        console.error('Error in createDigitalSignature:', error);
        throw error;
    }
}

/**
 * Verify digital signature using SHA256 with RSA
 * @param {string} data - The data that was signed
 * @param {string} signatureBase64 - The signature in base64
 * @returns {boolean} True if signature is valid
 */
function verifyDigitalSignature(data, signatureBase64) {
    try {
        // Decode signature from base64
        const signature = forge.util.decode64(signatureBase64);

        // Create SHA256 hash
        const md = forge.md.sha256.create();
        md.update(data, 'utf8');

        // Verify with SBI's public key using PKCS#1 v1.5 padding
        const sbiPublicKey = sbiCert.publicKey;
        const verified = sbiPublicKey.verify(md.digest().bytes(), signature, 'RSASSA-PKCS1-V1_5');

        return verified;
    } catch (error) {
        console.error('Error in verifyDigitalSignature:', error);
        return false;
    }
}

/**
 * Process incoming request from SBI (decrypt and verify)
 * @param {object} requestBody - The request body
 * @param {string} accessToken - The AccessToken header
 * @returns {object} Decrypted request data
 */
function processIncomingRequest(requestBody, accessToken) {
    try {
        // Step 1: Decrypt the AES key using our private key
        const decryptedAESKey = decryptAESKeyWithRSAPrivateKey(accessToken);

        // Step 2: Decrypt the REQUEST using the AES key
        // Note: In a real implementation, we would need to handle the IV and auth tag properly
        // For simplicity, we're assuming they're embedded or handled separately
        const decryptedRequest = Buffer.from(requestBody.REQUEST, 'base64').toString('utf8');

        // Step 3: Verify the digital signature
        const isSignatureValid = verifyDigitalSignature(decryptedRequest, requestBody.DIGI_SIGN);

        if (!isSignatureValid) {
            throw new Error('Digital signature verification failed');
        }

        return {
            success: true,
            decryptedRequest: JSON.parse(decryptedRequest),
            aesKey: decryptedAESKey
        };
    } catch (error) {
        console.error('Error processing incoming request:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Prepare outgoing request to SBI (encrypt and sign)
 * @param {object} payload - The payload to send
 * @returns {object} Encrypted request data
 */
function prepareOutgoingRequest(payload) {
    try {
        // Step 1: Generate a 32-character dynamic key
        const aesKey = generateDynamicKey();

        // Step 2: Encrypt the payload using AES
        const payloadString = JSON.stringify(payload);
        const encryptedPayload = encryptPayload(payloadString, aesKey);

        // Step 3: Create digital signature
        const digitalSignature = createDigitalSignature(payloadString);

        // Step 4: Encrypt the AES key with SBI's public key
        const encryptedAESKey = encryptAESKeyWithRSAPublicKey(aesKey);

        // Step 5: Prepare the request structure
        const requestReferenceNumber = 'SBISI' + Date.now(); // Generate unique reference number

        return {
            success: true,
            requestData: {
                REQUEST_REFERENCE_NUMBER: requestReferenceNumber,
                REQUEST: encryptedPayload.encryptedData,
                DIGI_SIGN: digitalSignature
            },
            accessToken: encryptedAESKey
        };
    } catch (error) {
        console.error('Error preparing outgoing request:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

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

function buildWhereClause(filters) {
    console.log("Building where clause:", filters)
    const whereParts = [];
    const params = [];

    // 1️⃣ Banks
    if (filters.banks && Array.isArray(filters.banks) && filters.banks.length > 0) {
        console.log("Found banks in filters", filters.banks);
        whereParts.push(`bank_name IN (${filters.banks.map(() => '?').join(',')})`);
        params.push(...filters.banks);
    }

    // 2️⃣ State / District / Pincode
    if (filters.state) {
        console.log("Found state in filters", filters.state);
        whereParts.push(`state = ?`);
        params.push(filters.state);
    }
    if (filters.district) {
        console.log("Found district in filters", filters.district)
        whereParts.push(`district = ?`);
        params.push(filters.district);
    }
    if (filters.pincode) {
        console.log("Found pincode in filters", filters.pincode)
        whereParts.push(`pincode = ?`);
        params.push(filters.pincode);
    }

    // 3️⃣ Pensioner types and subtypes (use both as a filter, to have right pairs: state autonomous and central autonomous, for example.)
    if (filters.pensioner_types) {
        const pensioner_where_clauses = [];
        const pensioner_params = [];
        console.log("Found pensioner_types in filters", JSON.stringify(filters.pensioner_types));
        Object.keys(filters.pensioner_types).forEach(pensioner_type => {
            const pensioner_subtypes = filters.pensioner_types[pensioner_type];
            if (pensioner_subtypes && pensioner_subtypes.length > 0) {
                const pensioner_type_clause = (`pensioner_type = ? `);
                const pensioner_subtypes_clause = (`pensioner_subtype IN (${pensioner_subtypes.map(() => '?').join(',')})`);
                pensioner_params.push(pensioner_type);
                pensioner_subtypes.forEach(subtype => {
                    pensioner_params.push(subtype);
                });
                const where_clause = `(${pensioner_type_clause} AND ${pensioner_subtypes_clause})`;
                pensioner_where_clauses.push(where_clause);
            }
        });
        if (pensioner_where_clauses.length > 0) {
            const or_joined_pensioner_type_filters = `(${pensioner_where_clauses.join(' OR ')})`;
            console.log("Final pensioner type where clause:", or_joined_pensioner_type_filters);
            console.log("Final pensioner type params:", pensioner_params);
            whereParts.push(or_joined_pensioner_type_filters);
            params.push(...pensioner_params);
        }
    }

    // 4️⃣ Age groups (translate each group into a YOB range condition)
    const currentYear = new Date().getFullYear();
    if (filters.age_groups && Array.isArray(filters.age_groups) && filters.age_groups.length > 0) {
        console.log("Found age groups in filters", filters.age_groups);
        const ageConditions = [];

        filters.age_groups.forEach((group) => {
            switch (group) {
                case "Below 60":
                    ageConditions.push(`${currentYear} - CAST(YOB AS INTEGER) < 60`);
                    break;
                case "60–70":
                    ageConditions.push(`${currentYear} - CAST(YOB AS INTEGER) BETWEEN 60 AND 69`);
                    break;
                case "70–80":
                    ageConditions.push(`${currentYear} - CAST(YOB AS INTEGER) BETWEEN 70 AND 79`);
                    break;
                case "80–90":
                    ageConditions.push(`${currentYear} - CAST(YOB AS INTEGER) BETWEEN 80 AND 89`);
                    break;
                case "Above 90":
                    ageConditions.push(`${currentYear} - CAST(YOB AS INTEGER) >= 90`);
                    break;
            }
        });

        if (ageConditions.length > 0) {
            whereParts.push(`(${ageConditions.join(' OR ')})`);
        }
    }

    // 5️⃣ Data status
    if (filters.data_status && filters.data_status !== "All") {
        console.log("Found data status in filters", JSON.stringify(filters.data_status));
        if (filters.data_status === "Completed") {
            whereParts.push(`LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != ''`);
        } else if (filters.data_status === "Pending") {
            whereParts.push(`LC_date IS NULL OR LTRIM(RTRIM(LC_date)) = ''`);
        } else if (filters.data_status === "Last year manual") {
            whereParts.push(`data_source = 'Manual'`); // Example condition
        }
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    console.log("--------------------------------------")
    console.log("Filters: ", JSON.stringify(filters))
    console.log("Where clause: ", whereClause)
    console.log("--------------------------------------")
    return { whereClause, params };
}



async function getDashboardStats(filters) {
    console.log("Getting dashboard stats with filters:", filters)
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
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
    const _ageWiseBreakdownQuery = `
            SELECT 
                SUM(CASE WHEN ${currentYear} - CAST(YOB AS INTEGER) < 60 THEN 1 ELSE 0 END) AS age_under_60,
                SUM(CASE WHEN ${currentYear} - CAST(YOB AS INTEGER) BETWEEN 60 AND 69 THEN 1 ELSE 0 END) AS age_60_70,
                SUM(CASE WHEN ${currentYear} - CAST(YOB AS INTEGER) BETWEEN 70 AND 79 THEN 1 ELSE 0 END) AS age_70_80,
                SUM(CASE WHEN ${currentYear} - CAST(YOB AS INTEGER) BETWEEN 80 AND 89 THEN 1 ELSE 0 END) AS age_80_90,
                SUM(CASE WHEN ${currentYear} - CAST(YOB AS INTEGER) >= 90 THEN 1 ELSE 0 END) AS age_90_plus
            FROM all_pensioners 
            WHERE YOB IS NOT NULL 
                AND CAST(YOB AS INTEGER) BETWEEN 1900 AND ${currentYear}
                `;

    const today = new Date();
    const yesterdaydt = new Date(today); // Create a copy to avoid modifying 'today'
    yesterdaydt.setDate(today.getDate() - 1);
    const yesterday = yesterdaydt.toISOString().split('T')[0]

    const { whereClause, params } = buildWhereClause(filters);

    const _summaryStatsQuery = ` 
            WITH cte_all_pensioners_with_dlc_done_flag AS (
                SELECT *, 
                    CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) != '' THEN 1 ELSE 0 END AS DLC_DONE
                FROM all_pensioners
            )
            SELECT
                COUNT(*) AS total_pensioners,
                SUM(dlc_done) AS dlc_done,
                SUM(CASE WHEN LC_date IS NOT NULL AND LTRIM(RTRIM(LC_date)) = '${yesterday}' THEN 1 ELSE 0 END) AS dlc_done_yesterday,
                COUNT(*) - SUM(dlc_done) AS dlc_pending,
                dlc_done*1.0 / COUNT(*) * 100.0 AS dlc_completion_ratio
            FROM  cte_all_pensioners_with_dlc_done_flag ${whereClause}`;


    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        console.log(_summaryStatsQuery);
        console.log(params);
        const [statsRow, ageWiseBreakdownRow] =
            await dbGetMany(db, [_summaryStatsQuery, _ageWiseBreakdownQuery], [params, []]);

        ageStats['<60 Years'] = ageWiseBreakdownRow?.age_under_60 || 0;
        ageStats['60-70 Years'] = ageWiseBreakdownRow?.age_60_70 || 0;
        ageStats['70-80 Years'] = ageWiseBreakdownRow?.age_70_80 || 0;
        ageStats['80-90 Years'] = ageWiseBreakdownRow?.age_80_90 || 0;
        ageStats['90+ Years'] = ageWiseBreakdownRow?.age_90_plus || 0;

        summaryStats.total_pensioners = statsRow?.total_pensioners || 0;
        summaryStats.dlc_done = statsRow?.dlc_done || 0;
        summaryStats.dlc_pending = statsRow?.dlc_pending || 0;
        summaryStats.dlc_completion_ratio = statsRow?.dlc_completion_ratio || 0;
        summaryStats.dlc_done_yesterday = statsRow?.dlc_done_yesterday || 0;
        summaryStats.data_accuracy = statsRow?.data_accuracy || "Coming soon";

        return {
            success: true,
            summaryStats: summaryStats,
            ageStats: ageStats
        }

    }
    catch (err) {
        console.log("Could not fetch dashboard statistics: ", err);
    }
    finally {
        closeDb();
    }
}


async function getTopStates(limit) {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Use only all_pensioners for both totals and verified (LC_date)

        let query = `select State, 
        count(*) as all_pensioner_count, 
        count(LC_date) as verified_pensioner_count, 
        (count(LC_date) * 1.0 / count(*)) * 100 as completion_ratio
        from all_pensioners 
        where state is Not null and State != 'null' 
        GROUP by state order by completion_ratio desc, all_pensioner_count desc`;
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

/**
 * Get certificate analysis data
 * @returns {Object} Certificate analysis data
 */
async function getCertificateAnalysis() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Initialize certificate data
        const certificateData = {
            digital: { total: 0, success: 0, failed: 0 },
            physical: { total: 0, success: 0, failed: 0 },
            video: { total: 0, success: 0, failed: 0 }
        };

        // Get certificate counts by submission mode
        const query = `
            SELECT 
                submission_mode,
                COUNT(*) as total_count,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as success_count
            FROM doppw_pensioner_data
            WHERE submission_mode IS NOT NULL AND submission_mode != 'nan'
            GROUP BY submission_mode
        `;

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        // Map data to certificate types
        rows.forEach(row => {
            const mode = row.submission_mode.toUpperCase();
            const total = row.total_count;
            const success = row.success_count;
            const failed = total - success;

            if (mode === 'DLC') {
                certificateData.digital.total = total;
                certificateData.digital.success = success;
                certificateData.digital.failed = failed;
            } else if (mode === 'PLC') {
                certificateData.physical.total = total;
                certificateData.physical.success = success;
                certificateData.physical.failed = failed;
            } else if (mode === 'VLC') {
                certificateData.video.total = total;
                certificateData.video.success = success;
                certificateData.video.failed = failed;
            }
        });

        return certificateData;
    } finally {
        closeDb();
    }
}

/**
 * Get state-wise pensioner statistics
 * @returns {Array} Array of states with their statistics
 */
async function getStateWisePensionerStats() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

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

// Routes

// Default route - serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard route - serve dashboard page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Additional health endpoint for proxy compatibility
app.get('//health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});


// Public dashboard statistics endpoint (for testing)
app.post('/api/dashboard/public-stats', async (req, res) => {
    try {
        const data = req.body; // Access data from the request body
        console.log("Request with filters:", JSON.stringify(data.filters));
        const stats = await getDashboardStats(data.filters);
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

// Add a specific OPTIONS handler for the stats endpoint to ensure CORS works properly
app.options('/api/dashboard/stats', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, AccessToken, accesstoken');
    res.sendStatus(200);
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

// New endpoint: detailed-top-states using exact SQL query
app.get('/api/dashboard/detailed-top-states', async (req, res) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const query = `
            SELECT 
                TRIM(State) AS State, 
                COUNT(*) AS all_pensioner_count, 
                COUNT(NULLIF(TRIM(LC_date), '')) AS verified_pensioner_count, 
                (COUNT(NULLIF(TRIM(LC_date), '')) * 100.0 / COUNT(*)) AS completion_ratio 
            FROM 
                all_pensioners 
            WHERE 
                State IS NOT NULL 
                AND LOWER(TRIM(State)) != 'null' 
            GROUP BY 
                TRIM(State) 
            ORDER BY 
                completion_ratio DESC, all_pensioner_count DESC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error executing detailed-top-states query:', err.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch detailed top states data'
                });
            } else {
                res.status(200).json({
                    success: true,
                    states: rows.map(r => ({
                        state: r.State,
                        all_pensioner_count: r.all_pensioner_count,
                        verified_pensioner_count: r.verified_pensioner_count,
                        completion_ratio: parseFloat(r.completion_ratio)
                    })),
                    totalStates: rows.length,
                    dataSources: ['all_pensioners']
                });
            }
            closeDb();
        });
    } catch (error) {
        console.error('Error in /api/dashboard/detailed-top-states:', error);
        closeDb();
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// New endpoint: detailed-top-banks using exact SQL query
app.get('/api/dashboard/detailed-top-banks', async (req, res) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        let query = `
            SELECT 
                TRIM(bank_name) AS bank_name, 
                COUNT(*) AS all_pensioner_count, 
                COUNT(NULLIF(TRIM(LC_date), '')) AS verified_pensioner_count, 
                (COUNT(NULLIF(TRIM(LC_date), '')) * 100.0 / COUNT(*)) AS completion_ratio 
            FROM 
                all_pensioners 
            WHERE 
                bank_name IS NOT NULL 
                AND LOWER(TRIM(bank_name)) != 'null' 
            GROUP BY 
                TRIM(bank_name) 
            ORDER BY 
                completion_ratio DESC, all_pensioner_count DESC
        `;

        query = _addLimitClauseIfNeeded(query, req.query.limit)
        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error executing detailed-top-banks query:', err.message);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch detailed top banks data'
                });
            } else {
                res.status(200).json({
                    success: true,
                    banks: rows.map(r => ({
                        bank_name: r.bank_name,
                        all_pensioner_count: r.all_pensioner_count,
                        verified_pensioner_count: r.verified_pensioner_count,
                        completion_ratio: parseFloat(r.completion_ratio)
                    })),
                    totalBanks: rows.length,
                    dataSources: ['all_pensioners']
                });
            }
            closeDb();
        });
    } catch (error) {
        console.error('Error in /api/dashboard/detailed-top-banks:', error);
        closeDb();
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});


// Authentication Methods Analysis Function
async function getAuthenticationMethodsAnalysis() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Get authentication methods data from submission_mode column
        const authMethodsData = await new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    submission_mode,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as failed_count
                FROM doppw_pensioner_data
                WHERE submission_mode IS NOT NULL AND submission_mode != 'nan'
                GROUP BY submission_mode
                ORDER BY total_count DESC
            `;

            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Map submission modes to user-friendly names
        const methodMapping = {
            'DLC': 'Digital',
            'PLC': 'Physical',
            'VLC': 'Video',
            'IRIS': 'IRIS',
            'FINGERPRINT': 'Fingerprint',
            'FACE': 'Face Auth'
        };

        // Process and format the data
        const formattedMethods = {};

        // Initialize all methods with 0
        Object.values(methodMapping).forEach(method => {
            formattedMethods[method] = {
                total: 0,
                success: 0,
                failed: 0,
                successRate: 0
            };
        });

        // Fill in actual data
        authMethodsData.forEach(row => {
            const methodName = methodMapping[row.submission_mode] || row.submission_mode;
            const successRate = row.total_count > 0 ? ((row.success_count / row.total_count) * 100).toFixed(2) : 0;

            formattedMethods[methodName] = {
                total: row.total_count,
                success: row.success_count,
                failed: row.failed_count,
                successRate: parseFloat(successRate)
            };
        });

        // Calculate totals
        const totalRecords = Object.values(formattedMethods).reduce((sum, method) => sum + method.total, 0);
        const totalSuccess = Object.values(formattedMethods).reduce((sum, method) => sum + method.success, 0);
        const overallSuccessRate = totalRecords > 0 ? ((totalSuccess / totalRecords) * 100).toFixed(2) : 0;

        return {
            authenticationMethods: formattedMethods,
            summary: {
                totalRecords,
                totalSuccess,
                totalFailed: totalRecords - totalSuccess,
                overallSuccessRate: parseFloat(overallSuccessRate)
            },
            dataSource: 'doppw_pensioner_data'
        };
    } finally {
        closeDb();
    }
}

// Public API endpoint for authentication methods analysis
app.get('/api/dashboard/authentication-methods', async (req, res) => {
    try {
        const authData = await getAuthenticationMethodsAnalysis();
        res.status(200).json({
            success: true,
            ...authData,
            timestamp: new Date().toISOString()
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
        const authData = await getAuthenticationMethodsAnalysis();
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
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

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
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

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

// Comprehensive Geographic Analysis Function
async function getComprehensiveGeographicAnalysis(stateName) {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const result = {
            state: stateName.toUpperCase(),
            districts: [],
            cities: [],
            pincodes: [],
            summary: {
                totalDistricts: 0,
                totalCities: 0,
                totalPincodes: 0,
                totalPensioners: 0
            },
            dataSources: []
        };

        // Query 1: DOPPW table - Districts and Pincodes
        const doppwQuery = `
            SELECT 
                pensioner_district as district,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_count,
                'doppw_pensioner_data' as source_table
            FROM doppw_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_district IS NOT NULL 
                AND pensioner_district != 'nan' 
                AND pensioner_district != ''
            GROUP BY pensioner_district, pensioner_pincode
            ORDER BY pensioner_count DESC
        `;

        const doppwData = await new Promise((resolve, reject) => {
            db.all(doppwQuery, [stateName], (err, rows) => {
                if (err) {
                    console.warn('DOPPW query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Query 2: Bank table - Cities
        const bankQuery = `
            SELECT 
                bank_city as city,
                COUNT(*) as records,
                SUM(COALESCE(grand_total, 0)) as pensioner_count,
                'bank_pensioner_data' as source_table
            FROM bank_pensioner_data
            WHERE UPPER(bank_state) = UPPER(?)
                AND bank_city IS NOT NULL 
                AND bank_city != 'nan' 
                AND bank_city != ''
            GROUP BY bank_city
            ORDER BY pensioner_count DESC
        `;

        const bankData = await new Promise((resolve, reject) => {
            db.all(bankQuery, [stateName], (err, rows) => {
                if (err) {
                    console.warn('Bank query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Query 3: UBI3 table - Cities and Pincodes
        const ubi3Query = `
            SELECT 
                pensioner_city as city,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count,
                'ubi3_pensioner_data' as source_table
            FROM ubi3_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_city IS NOT NULL 
                AND pensioner_city != 'nan' 
                AND pensioner_city != ''
            GROUP BY pensioner_city, pensioner_pincode
            ORDER BY pensioner_count DESC
        `;

        const ubi3Data = await new Promise((resolve, reject) => {
            db.all(ubi3Query, [stateName], (err, rows) => {
                if (err) {
                    console.warn('UBI3 query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Query 4: UBI1 table - Cities and Pincodes
        const ubi1Query = `
            SELECT 
                pensioner_city as city,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count,
                'ubi1_pensioner_data' as source_table
            FROM ubi1_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_city IS NOT NULL 
                AND pensioner_city != 'nan' 
                AND pensioner_city != ''
            GROUP BY pensioner_city, pensioner_pincode
            ORDER BY pensioner_count DESC
        `;

        const ubi1Data = await new Promise((resolve, reject) => {
            db.all(ubi1Query, [stateName], (err, rows) => {
                if (err) {
                    console.warn('UBI1 query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Process Districts (from DOPPW data)
        const districtMap = new Map();
        doppwData.forEach(row => {
            if (row.district) {
                const districtKey = row.district.toUpperCase();
                if (districtMap.has(districtKey)) {
                    const existing = districtMap.get(districtKey);
                    existing.totalPensioners += row.pensioner_count;
                    existing.verifiedPensioners += row.verified_count;
                    existing.pincodes.push({
                        pincode: row.pincode,
                        pensioners: row.pensioner_count,
                        verified: row.verified_count
                    });
                } else {
                    districtMap.set(districtKey, {
                        district: row.district,
                        totalPensioners: row.pensioner_count,
                        verifiedPensioners: row.verified_count,
                        pincodes: row.pincode ? [{
                            pincode: row.pincode,
                            pensioners: row.pensioner_count,
                            verified: row.verified_count
                        }] : [],
                        dataSources: ['doppw_pensioner_data']
                    });
                }
            }
        });

        result.districts = Array.from(districtMap.values()).map(district => ({
            ...district,
            totalPincodes: district.pincodes.length,
            verificationRate: district.totalPensioners > 0 ?
                parseFloat(((district.verifiedPensioners / district.totalPensioners) * 100).toFixed(2)) : 0,
            // Sort pincodes by pensioner count
            pincodes: district.pincodes.sort((a, b) => b.pensioners - a.pensioners)
        })).sort((a, b) => b.totalPensioners - a.totalPensioners);

        // Process Cities (from Bank, UBI3, UBI1 data)
        const cityMap = new Map();

        // Add bank cities
        bankData.forEach(row => {
            if (row.city) {
                const cityKey = row.city.toUpperCase();
                cityMap.set(cityKey, {
                    city: row.city,
                    totalPensioners: row.pensioner_count,
                    records: row.records,
                    pincodes: [],
                    dataSources: ['bank_pensioner_data']
                });
            }
        });

        // Add UBI3 cities
        ubi3Data.forEach(row => {
            if (row.city) {
                const cityKey = row.city.toUpperCase();
                if (cityMap.has(cityKey)) {
                    const existing = cityMap.get(cityKey);
                    existing.totalPensioners += row.pensioner_count;
                    existing.dataSources.push('ubi3_pensioner_data');
                    if (row.pincode) {
                        existing.pincodes.push({
                            pincode: row.pincode,
                            pensioners: row.pensioner_count
                        });
                    }
                } else {
                    cityMap.set(cityKey, {
                        city: row.city,
                        totalPensioners: row.pensioner_count,
                        records: 1,
                        pincodes: row.pincode ? [{
                            pincode: row.pincode,
                            pensioners: row.pensioner_count
                        }] : [],
                        dataSources: ['ubi3_pensioner_data']
                    });
                }
            }
        });

        // Add UBI1 cities
        ubi1Data.forEach(row => {
            if (row.city) {
                const cityKey = row.city.toUpperCase();
                if (cityMap.has(cityKey)) {
                    const existing = cityMap.get(cityKey);
                    existing.totalPensioners += row.pensioner_count;
                    existing.dataSources.push('ubi1_pensioner_data');
                    if (row.pincode) {
                        existing.pincodes.push({
                            pincode: row.pincode,
                            pensioners: row.pensioner_count
                        });
                    }
                } else {
                    cityMap.set(cityKey, {
                        city: row.city,
                        totalPensioners: row.pensioner_count,
                        records: 1,
                        pincodes: row.pincode ? [{
                            pincode: row.pincode,
                            pensioners: row.pensioner_count
                        }] : [],
                        dataSources: ['ubi1_pensioner_data']
                    });
                }
            }
        });

        result.cities = Array.from(cityMap.values()).map(city => ({
            ...city,
            totalPincodes: city.pincodes.length,
            dataSources: [...new Set(city.dataSources)],
            // Sort pincodes by pensioner count
            pincodes: city.pincodes.sort((a, b) => b.pensioners - a.pensioners)
        })).sort((a, b) => b.totalPensioners - a.totalPensioners);

        // Process All Pincodes
        const pincodeMap = new Map();

        // Add pincodes from all sources
        [...doppwData, ...ubi3Data, ...ubi1Data].forEach(row => {
            if (row.pincode && row.pincode !== 'nan' && row.pincode !== '') {
                const pincodeKey = row.pincode;
                if (pincodeMap.has(pincodeKey)) {
                    const existing = pincodeMap.get(pincodeKey);
                    existing.totalPensioners += row.pensioner_count;
                    existing.dataSources.push(row.source_table);
                    if (row.verified_count) {
                        existing.verifiedPensioners += row.verified_count;
                    }
                } else {
                    pincodeMap.set(pincodeKey, {
                        pincode: row.pincode,
                        totalPensioners: row.pensioner_count,
                        verifiedPensioners: row.verified_count || 0,
                        district: row.district || null,
                        city: row.city || null,
                        dataSources: [row.source_table]
                    });
                }
            }
        });

        result.pincodes = Array.from(pincodeMap.values()).map(pincode => ({
            ...pincode,
            verificationRate: pincode.totalPensioners > 0 ?
                parseFloat(((pincode.verifiedPensioners / pincode.totalPensioners) * 100).toFixed(2)) : 0,
            dataSources: [...new Set(pincode.dataSources)]
        })).sort((a, b) => b.totalPensioners - a.totalPensioners);

        // Calculate summary
        result.summary = {
            totalDistricts: result.districts.length,
            totalCities: result.cities.length,
            totalPincodes: result.pincodes.length,
            totalPensioners: result.districts.reduce((sum, d) => sum + d.totalPensioners, 0) +
                result.cities.reduce((sum, c) => sum + c.totalPensioners, 0)
        };

        result.dataSources = [
            'doppw_pensioner_data (districts & pincodes)',
            'bank_pensioner_data (cities)',
            'ubi3_pensioner_data (cities & pincodes)',
            'ubi1_pensioner_data (cities & pincodes)'
        ];

        return result;
    } finally {
        closeDb();
    }
}

// Geographic Analysis API - State-wise Districts, Cities, and Pincodes
app.get('/api/geography/state-analysis/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName || stateName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'State name is required'
            });
        }

        const geoData = await getComprehensiveGeographicAnalysis(stateName);

        res.status(200).json({
            success: true,
            ...geoData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/geography/state-analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch geographic analysis data'
        });
    }
});

// Get all available states for geographic analysis
app.get('/api/geography/available-states', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get states from all tables
            const queries = [
                "SELECT DISTINCT pensioner_state as state FROM doppw_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'",
                "SELECT DISTINCT bank_state as state FROM bank_pensioner_data WHERE bank_state IS NOT NULL AND bank_state != 'nan'",
                "SELECT DISTINCT pensioner_state as state FROM ubi3_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'",
                "SELECT DISTINCT pensioner_state as state FROM ubi1_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'"
            ];

            const allStates = await Promise.all(queries.map(query =>
                new Promise((resolve) => {
                    db.all(query, [], (err, rows) => {
                        if (err) {
                            console.warn(`Query failed: ${query}`, err.message);
                            resolve([]);
                        } else {
                            resolve(rows.map(row => row.state));
                        }
                    });
                })
            ));

            const uniqueStates = [...new Set(allStates.flat())].sort();

            res.status(200).json({
                success: true,
                states: uniqueStates,
                totalStates: uniqueStates.length
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/geography/available-states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch available states'
        });
    }
});

// Detailed Geographic Lists API - Complete Districts, Cities, Pincodes for a State
app.get('/api/geography/detailed-lists/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;
        const { type = 'all', limit } = req.query; // type: 'districts', 'cities', 'pincodes', 'all'

        if (!stateName || stateName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'State name is required'
            });
        }

        const geoData = await getComprehensiveGeographicAnalysis(stateName);

        let response = {
            success: true,
            state: geoData.state,
            summary: geoData.summary
        };

        // Apply limit if specified
        const applyLimit = (array, limitValue) => {
            return limitValue ? array.slice(0, parseInt(limitValue)) : array;
        };

        if (type === 'all' || type === 'districts') {
            response.districts = applyLimit(geoData.districts, limit);
        }

        if (type === 'all' || type === 'cities') {
            response.cities = applyLimit(geoData.cities, limit);
        }

        if (type === 'all' || type === 'pincodes') {
            response.pincodes = applyLimit(geoData.pincodes, limit);
        }

        response.dataSources = geoData.dataSources;
        response.timestamp = new Date().toISOString();

        res.status(200).json(response);
    } catch (error) {
        console.error('Error in /api/geography/detailed-lists:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch detailed geographic lists'
        });
    }
});

// Quick Geographic Summary API - Just counts and top items
app.get('/api/geography/quick-summary/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName || stateName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'State name is required'
            });
        }

        const geoData = await getComprehensiveGeographicAnalysis(stateName);

        res.status(200).json({
            success: true,
            state: geoData.state,
            summary: geoData.summary,
            topDistricts: geoData.districts.slice(0, 10),
            topCities: geoData.cities.slice(0, 10),
            topPincodes: geoData.pincodes.slice(0, 20),
            dataSources: geoData.dataSources,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/geography/quick-summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch geographic summary'
        });
    }
});

// Endpoint to get certificate analysis data (updated to use authentication methods)
app.get('/api/dashboard/certificate-analysis', async (req, res) => {
    try {
        const authData = await getAuthenticationMethodsAnalysis();
        const methods = authData.authenticationMethods;

        // Format for certificate analysis response
        const certificateTypes = {
            digital: methods.Digital.total,
            physical: methods.Physical.total,
            video: methods.Video.total,
            iris: methods.IRIS.total,
            fingerprint: methods.Fingerprint.total,
            faceAuth: methods['Face Auth'].total
        };

        const successRates = {
            digital: methods.Digital.successRate,
            physical: methods.Physical.successRate,
            video: methods.Video.successRate,
            iris: methods.IRIS.successRate,
            fingerprint: methods.Fingerprint.successRate,
            faceAuth: methods['Face Auth'].successRate
        };

        // Calculate distribution percentages
        const totalCertificates = authData.summary.totalRecords;
        const digitalPercent = totalCertificates > 0 ? ((methods.Digital.total / totalCertificates) * 100).toFixed(1) : 0;
        const physicalPercent = totalCertificates > 0 ? ((methods.Physical.total / totalCertificates) * 100).toFixed(1) : 0;
        const videoPercent = totalCertificates > 0 ? ((methods.Video.total / totalCertificates) * 100).toFixed(1) : 0;

        const detailedAnalytics = [
            {
                type: 'Digital',
                total: methods.Digital.total,
                filtered: methods.Digital.total,
                successRate: methods.Digital.successRate,
                avgTime: '2.3s'
            },
            {
                type: 'Physical',
                total: methods.Physical.total,
                filtered: methods.Physical.total,
                successRate: methods.Physical.successRate,
                avgTime: '45s'
            },
            {
                type: 'Video',
                total: methods.Video.total,
                filtered: methods.Video.total,
                successRate: methods.Video.successRate,
                avgTime: '12s'
            }
        ];

        res.status(200).json({
            success: true,
            certificateTypes: certificateTypes,
            successRates: successRates,
            processingTimes: {
                digital: '2.3s',
                physical: '45s',
                video: '12s',
                iris: '1.5s',
                fingerprint: '0.8s',
                faceAuth: '1.2s'
            },
            certificateDistribution: {
                digital: parseFloat(digitalPercent),
                physical: parseFloat(physicalPercent),
                video: parseFloat(videoPercent)
            },
            detailedAnalytics: detailedAnalytics,
            summary: authData.summary,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/dashboard/certificate-analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch certificate analysis data'
        });
    }
});

// Endpoint to get state-wise pensioner statistics (protected)
app.get('/api/dashboard/state-stats', authenticateToken, async (req, res) => {
    try {
        const stateStats = await getStateWisePensionerStats();
        res.status(200).json({
            stateStats: stateStats
        });
    } catch (error) {
        console.error('Error in /api/dashboard/state-stats:', error);
        res.status(500).json({
            error: 'Failed to fetch state-wise pensioner statistics'
        });
    }
});

// Advanced filtering endpoint
app.get('/api/dashboard/filtered-stats', async (req, res) => {
    try {
        // Get query parameters
        const { status, bank, ageGroup, psaCategory } = req.query;

        // Log the received parameters for debugging
        console.log('Received filters:', { status, bank, ageGroup, psaCategory });

        // Build dynamic query based on filters
        let baseQuery = `
            SELECT 
                pensioner_state as state,
                COUNT(*) as total,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
            FROM doppw_pensioner_data
            WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'
        `;

        const conditions = [];
        const params = [];

        // Status filter
        if (status === 'Completed') {
            conditions.push("submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED')");
        } else if (status === 'Pending') {
            conditions.push("(submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED'))");
        }

        // Bank filter - check if branch_name contains the bank name
        if (bank && bank !== 'All' && bank !== 'all') {
            conditions.push("branch_name LIKE ?");
            params.push(`%${bank}%`);
        }

        // Age group filter
        if (ageGroup && ageGroup !== 'All' && ageGroup !== 'all') {
            if (ageGroup === '<60') {
                conditions.push("age < 60");
            } else if (ageGroup === '60-70') {
                conditions.push("age >= 60 AND age <= 70");
            } else if (ageGroup === '70-80') {
                conditions.push("age > 70 AND age <= 80");
            } else if (ageGroup === '80-90') {
                conditions.push("age > 80 AND age <= 90");
            } else if (ageGroup === '>90') {
                conditions.push("age > 90");
            }
        }

        // PSA Category filter
        if (psaCategory && psaCategory !== 'All' && psaCategory !== 'all') {
            // Map PSA categories to escroll_category values
            const psaMap = {
                'Railway': 'RAILWAY',
                'Civil': 'STATE',
                'Defence': 'DEFENCE'
            };

            const mappedCategory = psaMap[psaCategory];
            if (mappedCategory) {
                conditions.push("escroll_cat = ?");
                params.push(mappedCategory);
            }
        }

        // Add conditions to query
        if (conditions.length > 0) {
            baseQuery += " AND " + conditions.join(" AND ");
        }

        // Group by and order
        baseQuery += " GROUP BY pensioner_state ORDER BY total DESC";

        // Log the final query for debugging
        // console.log('Executing query:', baseQuery);
        // console.log('With parameters:', params);

        // Execute query
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            const rows = await new Promise((resolve, reject) => {
                db.all(baseQuery, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Calculate completion percentage for each state
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                            return {
                                state: row.state,
                                total: row.total,
                                verified: row.verified,
                                pending: row.pending,
                                completionPercentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            res.status(200).json({
                stateDetails: rows,
                filtersApplied: {
                    status: status || 'All',
                    bank: bank || 'All',
                    ageGroup: ageGroup || 'All',
                    psaCategory: psaCategory || 'All'
                },
                totalStates: rows.length
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/dashboard/filtered-stats:', error);
        res.status(500).json({
            error: 'Failed to fetch state-wise pensioner statistics'
        });
    }
});


// Enhanced comprehensive filtering endpoint - works across ALL tables with detailed breakdown
app.get('/api/pensioners/comprehensive-filtered-stats', async (req, res) => {
    try {
        const { status, bank, ageGroup, psaCategory, state, district, pincode, submissionMode } = req.query;

        console.log('Comprehensive filters received:', { status, bank, ageGroup, psaCategory, state, district, pincode, submissionMode });

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Main query from doppw_pensioner_data (most comprehensive table)
            let mainQuery = `
                SELECT 
                    pensioner_state as state,
                    pensioner_district as district,
                    pensioner_pincode as pincode,
                    branch_name as bank,
                    escroll_cat as psa_category,
                    pension_type,
                    submission_mode,
                    age,
                    COUNT(*) as total,
                    SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED', 'COMPLETED') THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'COMPLETED', 'WAIVED') THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN submission_mode = 'DLC' THEN 1 ELSE 0 END) as dlc_count,
                    SUM(CASE WHEN submission_mode = 'PLC' THEN 1 ELSE 0 END) as manual_count,
                    SUM(CASE WHEN submission_mode = 'VLC' THEN 1 ELSE 0 END) as video_count,
                    'doppw_pensioner_data' as source_table
                FROM doppw_pensioner_data
                WHERE 1=1
            `;
            const mainParams = [];

            // Apply filters
            if (state && state !== 'All' && state.trim() !== '') {
                mainQuery += " AND UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))";
                mainParams.push(state);
            }

            if (district && district !== 'All' && district.trim() !== '') {
                mainQuery += " AND UPPER(TRIM(pensioner_district)) = UPPER(TRIM(?))";
                mainParams.push(district);
            }

            if (pincode && pincode !== 'All' && pincode.trim() !== '') {
                mainQuery += " AND pensioner_pincode = ?";
                mainParams.push(pincode);
            }

            if (bank && bank !== 'All' && bank.trim() !== '') {
                mainQuery += " AND UPPER(branch_name) LIKE UPPER(?)";
                mainParams.push(`%${bank}%`);
            }

            if (status === 'completed' || status === 'Completed') {
                mainQuery += " AND submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED', 'COMPLETED')";
            } else if (status === 'pending' || status === 'Pending') {
                mainQuery += " AND (submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'COMPLETED', 'WAIVED'))";
            }

            if (ageGroup && ageGroup !== 'All') {
                if (ageGroup === '<60') {
                    mainQuery += " AND age < 60";
                } else if (ageGroup === '60-70') {
                    mainQuery += " AND age >= 60 AND age <= 70";
                } else if (ageGroup === '70-80') {
                    mainQuery += " AND age > 70 AND age <= 80";
                } else if (ageGroup === '80-90') {
                    mainQuery += " AND age > 80 AND age <= 90";
                } else if (ageGroup === '>90') {
                    mainQuery += " AND age > 90";
                }
            }

            if (psaCategory && psaCategory !== 'All') {
                // Map common PSA categories
                const psaMap = {
                    'Railway': ['RAILWAY', 'RAIL'],
                    'Civil': ['CIVIL', 'STATE', 'CENTRAL_GOVT'],
                    'Defence': ['DEFENCE', 'MILITARY'],
                    'CPAO': ['CPAO', 'CENTRAL PENSION ACCOUNTING OFFICE'],
                    'POSTAL': ['POSTAL', 'POST'],
                    'TELECOM': ['TELECOM', 'DOT'],
                    'EPFO': ['EPFO', 'PROVIDENT FUND']
                };

                const mappedCategories = psaMap[psaCategory] || [psaCategory.toUpperCase()];
                const placeholders = mappedCategories.map(() => '?').join(',');
                mainQuery += ` AND UPPER(escroll_cat) IN (${placeholders})`;
                mainParams.push(...mappedCategories);
            }

            if (submissionMode && submissionMode !== 'All') {
                mainQuery += " AND UPPER(submission_mode) = UPPER(?)";
                mainParams.push(submissionMode);
            }

            // Group by relevant fields based on what's being filtered
            let groupByFields = ['pensioner_state'];
            if (district && district !== 'All') {
                groupByFields.push('pensioner_district');
            }
            if (pincode && pincode !== 'All') {
                groupByFields.push('pensioner_pincode');
            }
            if (bank && bank !== 'All') {
                groupByFields.push('branch_name');
            }

            mainQuery += ` GROUP BY ${groupByFields.join(', ')}`;
            mainQuery += ` ORDER BY total DESC`;

            // console.log('Executing query:', mainQuery);
            // console.log('With parameters:', mainParams);

            // Execute main query
            const mainResults = await new Promise((resolve, reject) => {
                db.all(mainQuery, mainParams, (err, rows) => {
                    if (err) {
                        console.error('Main query failed:', err.message);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });

            // Get additional statistics
            let summaryQuery = `
                SELECT 
                    COUNT(*) as total_records,
                    SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED', 'COMPLETED') THEN 1 ELSE 0 END) as total_completed,
                    SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'COMPLETED', 'WAIVED') THEN 1 ELSE 0 END) as total_pending,
                    SUM(CASE WHEN submission_mode = 'DLC' THEN 1 ELSE 0 END) as total_dlc,
                    SUM(CASE WHEN submission_mode = 'PLC' THEN 1 ELSE 0 END) as total_manual,
                    SUM(CASE WHEN submission_mode = 'VLC' THEN 1 ELSE 0 END) as total_video,
                    COUNT(DISTINCT pensioner_state) as unique_states,
                    COUNT(DISTINCT pensioner_district) as unique_districts,
                    COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                    COUNT(DISTINCT branch_name) as unique_banks
                FROM doppw_pensioner_data
                WHERE 1=1
            `;

            // Apply same filters to summary query
            const summaryParams = [...mainParams];
            if (state && state !== 'All' && state.trim() !== '') {
                summaryQuery += " AND UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))";
            }
            if (district && district !== 'All' && district.trim() !== '') {
                summaryQuery += " AND UPPER(TRIM(pensioner_district)) = UPPER(TRIM(?))";
            }
            if (pincode && pincode !== 'All' && pincode.trim() !== '') {
                summaryQuery += " AND pensioner_pincode = ?";
            }
            if (bank && bank !== 'All' && bank.trim() !== '') {
                summaryQuery += " AND UPPER(branch_name) LIKE UPPER(?)";
            }
            if (status === 'completed' || status === 'Completed') {
                summaryQuery += " AND submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED', 'COMPLETED')";
            } else if (status === 'pending' || status === 'Pending') {
                summaryQuery += " AND (submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'COMPLETED', 'WAIVED'))";
            }
            if (ageGroup && ageGroup !== 'All') {
                if (ageGroup === '<60') {
                    summaryQuery += " AND age < 60";
                } else if (ageGroup === '60-70') {
                    summaryQuery += " AND age >= 60 AND age <= 70";
                } else if (ageGroup === '70-80') {
                    summaryQuery += " AND age > 70 AND age <= 80";
                } else if (ageGroup === '80-90') {
                    summaryQuery += " AND age > 80 AND age <= 90";
                } else if (ageGroup === '>90') {
                    summaryQuery += " AND age > 90";
                }
            }
            if (psaCategory && psaCategory !== 'All') {
                const psaMap = {
                    'Railway': ['RAILWAY', 'RAIL'],
                    'Civil': ['CIVIL', 'STATE', 'CENTRAL_GOVT'],
                    'Defence': ['DEFENCE', 'MILITARY'],
                    'CPAO': ['CPAO', 'CENTRAL PENSION ACCOUNTING OFFICE'],
                    'POSTAL': ['POSTAL', 'POST'],
                    'TELECOM': ['TELECOM', 'DOT'],
                    'EPFO': ['EPFO', 'PROVIDENT FUND']
                };
                const mappedCategories = psaMap[psaCategory] || [psaCategory.toUpperCase()];
                const placeholders = mappedCategories.map(() => '?').join(',');
                summaryQuery += ` AND UPPER(escroll_cat) IN (${placeholders})`;
            }
            if (submissionMode && submissionMode !== 'All') {
                summaryQuery += " AND UPPER(submission_mode) = UPPER(?)";
            }

            const summaryResults = await new Promise((resolve, reject) => {
                db.get(summaryQuery, summaryParams, (err, row) => {
                    if (err) {
                        console.error('Summary query failed:', err.message);
                        reject(err);
                    } else {
                        resolve(row || {});
                    }
                });
            });

            // Format results with completion percentages
            const formattedResults = mainResults.map(row => {
                const completionPercentage = row.total > 0 ? ((row.completed / row.total) * 100).toFixed(2) : 0;
                const dlcPercentage = row.total > 0 ? ((row.dlc_count / row.total) * 100).toFixed(2) : 0;
                const manualPercentage = row.total > 0 ? ((row.manual_count / row.total) * 100).toFixed(2) : 0;

                return {
                    state: row.state,
                    district: row.district,
                    pincode: row.pincode,
                    bank: row.bank,
                    psaCategory: row.psa_category,
                    pensionType: row.pension_type,
                    submissionMode: row.submission_mode,
                    age: row.age,
                    total: row.total,
                    completed: row.completed,
                    pending: row.pending,
                    completionPercentage: parseFloat(completionPercentage),
                    submissionBreakdown: {
                        dlc: row.dlc_count,
                        manual: row.manual_count,
                        video: row.video_count,
                        dlcPercentage: parseFloat(dlcPercentage),
                        manualPercentage: parseFloat(manualPercentage)
                    }
                };
            });

            res.status(200).json({
                success: true,
                results: formattedResults,
                summary: {
                    totalRecords: summaryResults.total_records || 0,
                    totalCompleted: summaryResults.total_completed || 0,
                    totalPending: summaryResults.total_pending || 0,
                    completionRate: summaryResults.total_records > 0 ?
                        parseFloat(((summaryResults.total_completed / summaryResults.total_records) * 100).toFixed(2)) : 0,
                    submissionModeBreakdown: {
                        dlc: summaryResults.total_dlc || 0,
                        manual: summaryResults.total_manual || 0,
                        video: summaryResults.total_video || 0,
                        dlcPercentage: summaryResults.total_records > 0 ?
                            parseFloat(((summaryResults.total_dlc / summaryResults.total_records) * 100).toFixed(2)) : 0,
                        manualPercentage: summaryResults.total_records > 0 ?
                            parseFloat(((summaryResults.total_manual / summaryResults.total_records) * 100).toFixed(2)) : 0
                    },
                    uniqueCounts: {
                        states: summaryResults.unique_states || 0,
                        districts: summaryResults.unique_districts || 0,
                        pincodes: summaryResults.unique_pincodes || 0,
                        banks: summaryResults.unique_banks || 0
                    }
                },
                filtersApplied: {
                    status: status || 'All',
                    bank: bank || 'All',
                    ageGroup: ageGroup || 'All',
                    psaCategory: psaCategory || 'All',
                    state: state || 'All',
                    district: district || 'All',
                    pincode: pincode || 'All',
                    submissionMode: submissionMode || 'All'
                },
                resultCount: formattedResults.length,
                dataSource: 'doppw_pensioner_data (comprehensive verification table)'
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/comprehensive-filtered-stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive filtered statistics',
            details: error.message
        });
    }
});

// New endpoint to get available filter options for dropdowns
app.get('/api/pensioners/filter-options', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get all unique states
            const states = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT pensioner_state as name, COUNT(*) as count
                    FROM doppw_pensioner_data 
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state 
                    ORDER BY count DESC
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Get all unique districts
            const districts = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT pensioner_district as name, pensioner_state as state, COUNT(*) as count
                    FROM doppw_pensioner_data 
                    WHERE pensioner_district IS NOT NULL AND pensioner_district != 'nan' AND pensioner_district != ''
                    GROUP BY pensioner_district, pensioner_state 
                    ORDER BY count DESC
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Get all unique banks
            const banks = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT branch_name as name, COUNT(*) as count
                    FROM doppw_pensioner_data 
                    WHERE branch_name IS NOT NULL AND branch_name != 'nan' AND branch_name != ''
                    GROUP BY branch_name 
                    ORDER BY count DESC
                    LIMIT 50
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Get all unique PSA categories
            const psaCategories = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT escroll_cat as name, COUNT(*) as count
                    FROM doppw_pensioner_data 
                    WHERE escroll_cat IS NOT NULL AND escroll_cat != 'nan' AND escroll_cat != ''
                    GROUP BY escroll_cat 
                    ORDER BY count DESC
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Get submission modes
            const submissionModes = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT DISTINCT submission_mode as name, COUNT(*) as count
                    FROM doppw_pensioner_data 
                    WHERE submission_mode IS NOT NULL AND submission_mode != 'nan' AND submission_mode != ''
                    GROUP BY submission_mode 
                    ORDER BY count DESC
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Get age ranges with counts
            const ageRanges = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        SUM(CASE WHEN age < 60 THEN 1 ELSE 0 END) as under_60,
                        SUM(CASE WHEN age >= 60 AND age <= 70 THEN 1 ELSE 0 END) as age_60_70,
                        SUM(CASE WHEN age > 70 AND age <= 80 THEN 1 ELSE 0 END) as age_70_80,
                        SUM(CASE WHEN age > 80 AND age <= 90 THEN 1 ELSE 0 END) as age_80_90,
                        SUM(CASE WHEN age > 90 THEN 1 ELSE 0 END) as over_90
                    FROM doppw_pensioner_data 
                    WHERE age IS NOT NULL
                `, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row || {});
                });
            });

            res.status(200).json({
                success: true,
                filterOptions: {
                    states: states.map(s => ({ name: s.name, count: s.count })),
                    districts: districts.map(d => ({ name: d.name, state: d.state, count: d.count })),
                    banks: banks.map(b => ({ name: b.name, count: b.count })),
                    psaCategories: psaCategories.map(p => ({ name: p.name, count: p.count })),
                    submissionModes: submissionModes.map(s => ({ name: s.name, count: s.count })),
                    ageGroups: [
                        { name: '<60', label: 'Under 60 Years', count: ageRanges.under_60 || 0 },
                        { name: '60-70', label: '60-70 Years', count: ageRanges.age_60_70 || 0 },
                        { name: '70-80', label: '70-80 Years', count: ageRanges.age_70_80 || 0 },
                        { name: '80-90', label: '80-90 Years', count: ageRanges.age_80_90 || 0 },
                        { name: '>90', label: 'Over 90 Years', count: ageRanges.over_90 || 0 }
                    ],
                    statusOptions: [
                        { name: 'completed', label: 'Completed', description: 'Verified/Submitted certificates' },
                        { name: 'pending', label: 'Pending', description: 'Not yet verified/submitted' }
                    ]
                },
                totalRecords: states.reduce((sum, s) => sum + s.count, 0),
                lastUpdated: new Date().toISOString()
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/filter-options:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch filter options'
        });
    }
});

// New endpoint to get district and pincode level statistics for a specific state
app.get('/api/pensioners/state-details/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName) {
            return res.status(400).json({
                error: 'State name is required'
            });
        }

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get district level statistics for the state
            const districtStats = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_district as district,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_district IS NOT NULL AND pensioner_district != 'nan'
                    GROUP BY pensioner_district
                    ORDER BY verified DESC
                `;
                db.all(query, [stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Calculate completion percentage for each district
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                            return {
                                district: row.district,
                                total: row.total,
                                verified: row.verified,
                                pending: row.pending,
                                completionPercentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            // Get pincode level statistics for the state (top 20 pincodes by verified count)
            const pincodeStats = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_pincode as pincode,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_pincode IS NOT NULL AND pensioner_pincode != 'nan'
                    GROUP BY pensioner_pincode
                    ORDER BY verified DESC
                    LIMIT 20
                `;
                db.all(query, [stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Calculate completion percentage for each pincode
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                            return {
                                pincode: row.pincode,
                                total: row.total,
                                verified: row.verified,
                                pending: row.pending,
                                completionPercentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            // Get summary statistics for the state
            const stateSummary = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending,
                        COUNT(DISTINCT pensioner_district) as totalDistricts,
                        COUNT(DISTINCT pensioner_pincode) as totalPincodes
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_state IS NOT NULL AND pensioner_state != 'nan'
                `;
                db.get(query, [stateName], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                        resolve({
                            state: stateName,
                            total: row.total,
                            verified: row.verified,
                            pending: row.pending,
                            totalDistricts: row.totalDistricts,
                            totalPincodes: row.totalPincodes,
                            completionPercentage: parseFloat(completionPercentage)
                        });
                    }
                });
            });

            res.status(200).json({
                stateSummary: stateSummary,
                districtStats: districtStats,
                pincodeStats: pincodeStats
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/state-details/:stateName:', error);
        res.status(500).json({
            error: 'Failed to fetch state details'
        });
    }
});

// Geography API - Get all states data (matching external API structure) - REMOVED DUPLICATE

// State name mapping function to handle different formats
function normalizeStateName(stateName) {
    const stateMapping = {
        'UTTARPRADESH': 'UTTAR PRADESH',
        'UTTARAKHAND': 'UTTARAKHAND',
        'MADHYAPRADESH': 'MADHYA PRADESH',
        'ANDHRAPRADESH': 'ANDHRA PRADESH',
        'ARUNACHALPRADESH': 'ARUNACHAL PRADESH',
        'HIMACHALPRADESH': 'HIMACHAL PRADESH',
        'WESTBENGAL': 'WEST BENGAL',
        'TAMILNADU': 'TAMIL NADU',
        'JAMMUANDKASHMIR': 'JAMMU & KASHMIR',
        'JAMMUKASHMIR': 'JAMMU & KASHMIR',
        'DADRANAGARHAVELI': 'DADRA & NAGAR HAVELI',
        'DAMANDIU': 'DAMAN & DIU',
        'ANDAMANNICOBAR': 'ANDAMAN & NICOBAR ISLANDS',
        'ANDAMANNICOBARISLANDS': 'ANDAMAN & NICOBAR ISLANDS',
        'NCTOFDELHI': 'NCT OF DELHI',
        'DELHI': 'NCT OF DELHI'
    };

    // Remove spaces and convert to uppercase for mapping
    const normalizedInput = stateName.replace(/\s+/g, '').toUpperCase();

    // Return mapped name or original with proper spacing
    return stateMapping[normalizedInput] || stateName;
}

// New comprehensive endpoint to get state-wise district data with PINCODE details from ALL database tables
app.get('/api/pensioners/state-districts/:stateName', async (req, res) => {
    try {
        let { stateName } = req.params;
        const { includeDistricts = 'true', includePincodes = 'false' } = req.query;

        if (!stateName) {
            return res.status(400).json({
                success: false,
                error: 'State name is required'
            });
        }

        // Normalize state name to match database format
        const normalizedStateName = normalizeStateName(decodeURIComponent(stateName));
        console.log(`Original: ${stateName}, Normalized: ${normalizedStateName}`);

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // If includePincodes is true, get pincode-level data
            if (includePincodes === 'true') {
                // Get pincode-level data from pensioner_pincode_data table
                // Since many records don't have district info, we'll use city as fallback
                const pincodeData = await new Promise((resolve, reject) => {
                    const query = `
                        SELECT 
                            pincode,
                            COALESCE(NULLIF(TRIM(district), ''), NULLIF(TRIM(city), ''), 'Unknown District') as district,
                            city,
                            SUM(total_pensioners) as total_pensioners,
                            SUM(age_less_than_80) as age_less_than_80,
                            SUM(age_more_than_80) as age_more_than_80,
                            SUM(age_not_available) as age_not_available,
                            COUNT(*) as record_count
                        FROM pensioner_pincode_data
                        WHERE UPPER(TRIM(state)) IN (?, ?, ?, ?) 
                            AND pincode IS NOT NULL 
                            AND pincode != '' 
                            AND pincode != 'nan'
                            AND total_pensioners > 0
                        GROUP BY pincode, COALESCE(NULLIF(TRIM(district), ''), NULLIF(TRIM(city), ''), 'Unknown District'), city
                        ORDER BY district, total_pensioners DESC
                    `;

                    // Try multiple state name variations for Uttar Pradesh
                    let stateVariations;
                    if (normalizedStateName.toUpperCase().includes('UTTAR')) {
                        stateVariations = [
                            'UTTAR PRADESH',
                            'UTTARPRADESH',
                            'UTTARAKHAND',
                            'UTTARANCHAL'
                        ];
                    } else {
                        stateVariations = [
                            normalizedStateName.toUpperCase(),
                            normalizedStateName.replace(/\s+/g, '').toUpperCase(),
                            normalizedStateName.toUpperCase(),
                            normalizedStateName.toUpperCase()
                        ];
                    }

                    db.all(query, stateVariations, (err, rows) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(rows || []);
                        }
                    });
                });

                // Group pincodes by district
                const districtPincodeMap = new Map();

                pincodeData.forEach(row => {
                    const district = row.district;
                    if (!districtPincodeMap.has(district)) {
                        districtPincodeMap.set(district, {
                            district: district,
                            total_pensioners: 0,
                            total_pincodes: 0,
                            pincodes: []
                        });
                    }

                    const districtData = districtPincodeMap.get(district);
                    districtData.total_pensioners += row.total_pensioners;
                    districtData.total_pincodes += 1;
                    districtData.pincodes.push({
                        pincode: row.pincode,
                        city: row.city,
                        total_pensioners: row.total_pensioners,
                        age_breakdown: {
                            less_than_80: row.age_less_than_80,
                            more_than_80: row.age_more_than_80,
                            age_not_available: row.age_not_available
                        }
                    });
                });

                // Convert to array and sort
                const districts = Array.from(districtPincodeMap.values())
                    .sort((a, b) => b.total_pensioners - a.total_pensioners);

                // Calculate state summary
                const stateSummary = {
                    state: normalizedStateName,
                    total_districts: districts.length,
                    total_pincodes: districts.reduce((sum, d) => sum + d.total_pincodes, 0),
                    total_pensioners: districts.reduce((sum, d) => sum + d.total_pensioners, 0),
                    data_source: 'pensioner_pincode_data'
                };

                return res.status(200).json({
                    success: true,
                    state_summary: stateSummary,
                    districts: districts,
                    message: `Found ${districts.length} districts with ${stateSummary.total_pincodes} pincodes for ${normalizedStateName}`
                });
            }

            // Original district-level aggregation (when includePincodes is false)
            // Get district-wise data from doppw_pensioner_data (main verification table)
            const doppwDistricts = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_district as district,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_district IS NOT NULL AND pensioner_district != 'nan' AND pensioner_district != ''
                    GROUP BY pensioner_district
                    ORDER BY total DESC
                `;
                db.all(query, [normalizedStateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(row => ({
                            district: row.district,
                            doppw_total: row.total,
                            doppw_verified: row.verified,
                            doppw_pending: row.pending,
                            doppw_completion_rate: row.total > 0 ? parseFloat(((row.verified / row.total) * 100).toFixed(2)) : 0
                        })));
                    }
                });
            });

            // Get data from ubi3_pensioner_data by state
            const ubi3Districts = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_city as district,
                        COUNT(*) as total
                    FROM ubi3_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_city IS NOT NULL AND pensioner_city != 'nan' AND pensioner_city != ''
                    GROUP BY pensioner_city
                `;
                db.all(query, [normalizedStateName], (err, rows) => {
                    if (err) {
                        console.warn('UBI3 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            district: row.district,
                            ubi3_total: row.total
                        })));
                    }
                });
            });

            // Get data from ubi1_pensioner_data by state
            const ubi1Districts = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_city as district,
                        COUNT(*) as total
                    FROM ubi1_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_city IS NOT NULL AND pensioner_city != 'nan' AND pensioner_city != ''
                    GROUP BY pensioner_city
                `;
                db.all(query, [normalizedStateName], (err, rows) => {
                    if (err) {
                        console.warn('UBI1 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            district: row.district,
                            ubi1_total: row.total
                        })));
                    }
                });
            });

            // Get data from bank_pensioner_data by state
            const bankDistricts = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        bank_city as district,
                        COUNT(*) as records,
                        SUM(COALESCE(grand_total, 0)) as total_pensioners
                    FROM bank_pensioner_data
                    WHERE bank_state = ? AND bank_city IS NOT NULL AND bank_city != 'nan' AND bank_city != ''
                    GROUP BY bank_city
                `;
                db.all(query, [normalizedStateName], (err, rows) => {
                    if (err) {
                        console.warn('Bank table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            district: row.district,
                            bank_records: row.records,
                            bank_total_pensioners: row.total_pensioners
                        })));
                    }
                });
            });

            // Get data from psa_pensioner_data (district level data)
            const psaDistricts = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        location_name as district,
                        COUNT(*) as records,
                        SUM(COALESCE(total_pensioners, 0)) as total_pensioners
                    FROM psa_pensioner_data
                    WHERE data_type = 'district' AND location_name IS NOT NULL AND location_name != 'nan' AND location_name != ''
                    GROUP BY location_name
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('PSA table query failed:', err.message);
                        resolve([]);
                    } else {
                        // Filter PSA districts that might belong to this state (approximate matching)
                        resolve(rows.map(row => ({
                            district: row.district,
                            psa_records: row.records,
                            psa_total_pensioners: row.total_pensioners
                        })));
                    }
                });
            });

            // Combine all district data with case-insensitive matching
            const allDistrictsMap = new Map();

            // Add doppw data (main table with verification status)
            doppwDistricts.forEach(district => {
                const normalizedKey = district.district.toUpperCase();
                allDistrictsMap.set(normalizedKey, {
                    ...district,
                    district: district.district // Keep original case for display
                });
            });

            // Add ubi3 data
            ubi3Districts.forEach(district => {
                const normalizedKey = district.district.toUpperCase();
                if (allDistrictsMap.has(normalizedKey)) {
                    allDistrictsMap.get(normalizedKey).ubi3_total = district.ubi3_total;
                } else {
                    allDistrictsMap.set(normalizedKey, {
                        district: district.district,
                        ubi3_total: district.ubi3_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add ubi1 data
            ubi1Districts.forEach(district => {
                const normalizedKey = district.district.toUpperCase();
                if (allDistrictsMap.has(normalizedKey)) {
                    allDistrictsMap.get(normalizedKey).ubi1_total = district.ubi1_total;
                } else {
                    allDistrictsMap.set(normalizedKey, {
                        district: district.district,
                        ubi1_total: district.ubi1_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add bank data
            bankDistricts.forEach(district => {
                const normalizedKey = district.district.toUpperCase();
                if (allDistrictsMap.has(normalizedKey)) {
                    const existing = allDistrictsMap.get(normalizedKey);
                    existing.bank_records = (existing.bank_records || 0) + district.bank_records;
                    existing.bank_total_pensioners = (existing.bank_total_pensioners || 0) + district.bank_total_pensioners;
                } else {
                    allDistrictsMap.set(normalizedKey, {
                        district: district.district,
                        bank_records: district.bank_records,
                        bank_total_pensioners: district.bank_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add psa data
            psaDistricts.forEach(district => {
                const normalizedKey = district.district.toUpperCase();
                if (allDistrictsMap.has(normalizedKey)) {
                    const existing = allDistrictsMap.get(normalizedKey);
                    existing.psa_records = (existing.psa_records || 0) + district.psa_records;
                    existing.psa_total_pensioners = (existing.psa_total_pensioners || 0) + district.psa_total_pensioners;
                } else {
                    allDistrictsMap.set(normalizedKey, {
                        district: district.district,
                        psa_records: district.psa_records,
                        psa_total_pensioners: district.psa_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Convert map to array and calculate combined totals
            const combinedDistricts = Array.from(allDistrictsMap.values()).map(district => {
                const combinedTotal = (district.doppw_total || 0) +
                    (district.ubi3_total || 0) +
                    (district.ubi1_total || 0) +
                    (district.bank_total_pensioners || 0) +
                    (district.psa_total_pensioners || 0);

                return {
                    ...district,
                    // Set defaults for missing values
                    doppw_total: district.doppw_total || 0,
                    doppw_verified: district.doppw_verified || 0,
                    doppw_pending: district.doppw_pending || 0,
                    doppw_completion_rate: district.doppw_completion_rate || 0,
                    ubi3_total: district.ubi3_total || 0,
                    ubi1_total: district.ubi1_total || 0,
                    bank_records: district.bank_records || 0,
                    bank_total_pensioners: district.bank_total_pensioners || 0,
                    psa_records: district.psa_records || 0,
                    psa_total_pensioners: district.psa_total_pensioners || 0,
                    combined_total_pensioners: combinedTotal
                };
            });

            // Sort by combined total (descending)
            combinedDistricts.sort((a, b) => b.combined_total_pensioners - a.combined_total_pensioners);

            // Calculate state summary
            const stateSummary = {
                state: normalizedStateName,
                total_districts: combinedDistricts.length,
                total_pensioners_all_tables: combinedDistricts.reduce((sum, district) => sum + district.combined_total_pensioners, 0),
                total_verified_doppw: combinedDistricts.reduce((sum, district) => sum + district.doppw_verified, 0),
                total_pending_doppw: combinedDistricts.reduce((sum, district) => sum + district.doppw_pending, 0),
                overall_completion_rate: 0
            };

            const totalDoppw = combinedDistricts.reduce((sum, district) => sum + district.doppw_total, 0);
            if (totalDoppw > 0) {
                stateSummary.overall_completion_rate = parseFloat(((stateSummary.total_verified_doppw / totalDoppw) * 100).toFixed(2));
            }

            res.status(200).json({
                success: true,
                state_summary: stateSummary,
                districts: combinedDistricts,
                table_info: {
                    doppw_pensioner_data: "Main verification table with pending/completed status",
                    ubi3_pensioner_data: "UBI3 pensioner records by city",
                    ubi1_pensioner_data: "UBI1 pensioner records by city",
                    bank_pensioner_data: "Bank-wise pensioner data by city",
                    psa_pensioner_data: "PSA district-wise data"
                }
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/state-districts/:stateName:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive district data for state'
        });
    }
});

// New endpoint to get pincode-level data for a specific district (matches external API format)
app.get('/api/pensioners/district-pincodes/:stateName/:districtName', async (req, res) => {
    try {
        let { stateName, districtName } = req.params;

        if (!stateName || !districtName) {
            return res.status(400).json({
                success: false,
                error: 'State name and district name are required'
            });
        }

        const normalizedStateName = normalizeStateName(decodeURIComponent(stateName));
        const normalizedDistrictName = decodeURIComponent(districtName);

        console.log(`Getting pincodes for District: ${normalizedDistrictName}, State: ${normalizedStateName}`);

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get pincode-level data for the specific district
            const pincodeData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pincode,
                        district,
                        city,
                        state,
                        SUM(total_pensioners) as total_pensioners,
                        SUM(age_less_than_80) as age_less_than_80,
                        SUM(age_more_than_80) as age_more_than_80,
                        SUM(age_not_available) as age_not_available,
                        COUNT(*) as record_count,
                        GROUP_CONCAT(DISTINCT bank_name) as banks,
                        GROUP_CONCAT(DISTINCT data_source) as data_sources
                    FROM pensioner_pincode_data
                    WHERE UPPER(TRIM(state)) IN (?, ?) 
                        AND UPPER(TRIM(district)) LIKE ?
                        AND pincode IS NOT NULL 
                        AND pincode != '' 
                        AND pincode != 'nan'
                    GROUP BY pincode, district, city, state
                    ORDER BY total_pensioners DESC
                `;

                const stateVariations = [
                    normalizedStateName.toUpperCase(),
                    normalizedStateName.replace(/\s+/g, '').toUpperCase()
                ];

                const districtPattern = `%${normalizedDistrictName.toUpperCase()}%`;

                db.all(query, [...stateVariations, districtPattern], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });

            // Format the response to match external API structure
            const formattedPincodes = pincodeData.map(row => ({
                pincode: row.pincode,
                city: row.city || row.district,
                district: row.district,
                state: row.state,
                total_pensioners: row.total_pensioners,
                age_distribution: {
                    less_than_80: row.age_less_than_80,
                    more_than_80: row.age_more_than_80,
                    age_not_available: row.age_not_available
                },
                banks_served: row.banks ? row.banks.split(',').length : 0,
                data_sources: row.data_sources ? row.data_sources.split(',') : []
            }));

            // Calculate summary statistics
            const summary = {
                state: normalizedStateName,
                district: normalizedDistrictName,
                total_pincodes: formattedPincodes.length,
                total_pensioners: formattedPincodes.reduce((sum, p) => sum + p.total_pensioners, 0),
                total_banks: new Set(
                    formattedPincodes
                        .filter(p => p.data_sources)
                        .flatMap(p => p.data_sources)
                ).size
            };

            res.status(200).json({
                success: true,
                summary: summary,
                pincodes: formattedPincodes,
                message: `Found ${formattedPincodes.length} pincodes in ${normalizedDistrictName}, ${normalizedStateName}`
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/district-pincodes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pincode data for district'
        });
    }
});

// Enhanced endpoint that exactly matches the external API format for UTTARPRADESH
app.get('/api/pensioners/state-districts/UTTARPRADESH', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get district-wise data with pincode counts for Uttar Pradesh
            const districtData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        district,
                        COUNT(DISTINCT pincode) as total_pincodes,
                        SUM(total_pensioners) as total_pensioners,
                        SUM(age_less_than_80) as age_less_than_80,
                        SUM(age_more_than_80) as age_more_than_80,
                        SUM(age_not_available) as age_not_available,
                        COUNT(DISTINCT bank_name) as total_banks
                    FROM pensioner_pincode_data
                    WHERE UPPER(TRIM(state)) IN ('UTTAR PRADESH', 'UTTARPRADESH') 
                        AND district IS NOT NULL 
                        AND district != '' 
                        AND district != 'nan'
                        AND pincode IS NOT NULL 
                        AND pincode != '' 
                        AND pincode != 'nan'
                    GROUP BY district
                    ORDER BY total_pensioners DESC
                `;

                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });

            // Format response to match external API
            const districts = districtData.map(row => ({
                district: row.district,
                total_pincodes: row.total_pincodes,
                total_pensioners: row.total_pensioners,
                age_distribution: {
                    less_than_80: row.age_less_than_80,
                    more_than_80: row.age_more_than_80,
                    age_not_available: row.age_not_available
                },
                banks_count: row.total_banks
            }));

            const summary = {
                state: 'UTTARPRADESH',
                total_districts: districts.length,
                total_pincodes: districts.reduce((sum, d) => sum + d.total_pincodes, 0),
                total_pensioners: districts.reduce((sum, d) => sum + d.total_pensioners, 0),
                data_source: 'pensioner_pincode_data'
            };

            res.status(200).json({
                success: true,
                state: 'UTTARPRADESH',
                summary: summary,
                districts: districts,
                message: `Found ${districts.length} districts with pincode data for Uttar Pradesh`
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in UTTARPRADESH specific endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Uttar Pradesh district data'
        });
    }
});

// Geography districts endpoint - REMOVED DUPLICATE

// Geography states endpoint - matches external API format exactly - DISABLED (DUPLICATE)
app.get('/geography/states-old-disabled', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get state-wise data from doppw_pensioner_data (main verification table)
            const doppwStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                    ORDER BY total DESC
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            doppw_total: row.total,
                            doppw_verified: row.verified,
                            doppw_pending: row.pending,
                            doppw_completion_rate: row.total > 0 ? parseFloat(((row.verified / row.total) * 100).toFixed(2)) : 0
                        })));
                    }
                });
            });

            // Get state-wise data from dot_pensioner_data (no state column, so skip)
            const dotStates = [];

            // Get state-wise data from ubi3_pensioner_data
            const ubi3States = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total
                    FROM ubi3_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('UBI3 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            ubi3_total: row.total
                        })));
                    }
                });
            });

            // Get state-wise data from ubi1_pensioner_data
            const ubi1States = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total
                    FROM ubi1_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('UBI1 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            ubi1_total: row.total
                        })));
                    }
                });
            });

            // Get state-wise data from bank_pensioner_data
            const bankStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        bank_state as state,
                        COUNT(*) as records,
                        SUM(COALESCE(grand_total, 0)) as total_pensioners
                    FROM bank_pensioner_data
                    WHERE bank_state IS NOT NULL AND bank_state != 'nan' AND bank_state != ''
                    GROUP BY bank_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('Bank table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            bank_records: row.records,
                            bank_total_pensioners: row.total_pensioners
                        })));
                    }
                });
            });

            // Get state-wise data from psa_pensioner_data (include both state and district level data)
            const psaStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        location_name as state,
                        COUNT(*) as records,
                        SUM(COALESCE(total_pensioners, 0)) as total_pensioners
                    FROM psa_pensioner_data
                    WHERE location_name IS NOT NULL AND location_name != 'nan' AND location_name != ''
                    GROUP BY location_name
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('PSA table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            psa_records: row.records,
                            psa_total_pensioners: row.total_pensioners
                        })));
                    }
                });
            });

            // Combine all state data
            const allStatesMap = new Map();

            // Add doppw data (main table with verification status)
            doppwStates.forEach(state => {
                allStatesMap.set(state.state, { ...state });
            });

            // Add dot data (empty for now as no state column)
            dotStates.forEach(state => {
                if (allStatesMap.has(state.state)) {
                    allStatesMap.get(state.state).dot_total = state.dot_total;
                } else {
                    allStatesMap.set(state.state, {
                        state: state.state,
                        dot_total: state.dot_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add ubi3 data
            ubi3States.forEach(state => {
                if (allStatesMap.has(state.state)) {
                    allStatesMap.get(state.state).ubi3_total = state.ubi3_total;
                } else {
                    allStatesMap.set(state.state, {
                        state: state.state,
                        ubi3_total: state.ubi3_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add ubi1 data
            ubi1States.forEach(state => {
                if (allStatesMap.has(state.state)) {
                    allStatesMap.get(state.state).ubi1_total = state.ubi1_total;
                } else {
                    allStatesMap.set(state.state, {
                        state: state.state,
                        ubi1_total: state.ubi1_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add bank data
            bankStates.forEach(state => {
                if (allStatesMap.has(state.state)) {
                    Object.assign(allStatesMap.get(state.state), {
                        bank_records: state.bank_records,
                        bank_total_pensioners: state.bank_total_pensioners
                    });
                } else {
                    allStatesMap.set(state.state, {
                        state: state.state,
                        bank_records: state.bank_records,
                        bank_total_pensioners: state.bank_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add psa data
            psaStates.forEach(state => {
                if (allStatesMap.has(state.state)) {
                    Object.assign(allStatesMap.get(state.state), {
                        psa_records: state.psa_records,
                        psa_total_pensioners: state.psa_total_pensioners
                    });
                } else {
                    allStatesMap.set(state.state, {
                        state: state.state,
                        psa_records: state.psa_records,
                        psa_total_pensioners: state.psa_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Convert map to array and calculate combined totals
            const combinedStates = Array.from(allStatesMap.values()).map(state => {
                const combinedTotal = (state.doppw_total || 0) +
                    (state.dot_total || 0) +
                    (state.bank_total_pensioners || 0) +
                    (state.psa_total_pensioners || 0) +
                    (state.ubi3_total || 0) +
                    (state.ubi1_total || 0);

                return {
                    state: state.state,
                    psa_records: state.psa_records || 0,
                    psa_total_pensioners: state.psa_total_pensioners || 0,
                    doppw_total: state.doppw_total || 0,
                    doppw_verified: state.doppw_verified || 0,
                    doppw_pending: state.doppw_pending || 0,
                    doppw_completion_rate: state.doppw_completion_rate || 0,
                    dot_total: state.dot_total || 0,
                    bank_records: state.bank_records || 0,
                    bank_total_pensioners: state.bank_total_pensioners || 0,
                    ubi3_total: state.ubi3_total || 0,
                    ubi1_total: state.ubi1_total || 0,
                    combined_total_pensioners: combinedTotal
                };
            });

            // Sort by combined total (descending)
            combinedStates.sort((a, b) => b.combined_total_pensioners - a.combined_total_pensioners);

            // Calculate summary statistics
            const summary = {
                total_states: combinedStates.length,
                total_pensioners_all_tables: combinedStates.reduce((sum, state) => sum + state.combined_total_pensioners, 0),
                total_verified_doppw: combinedStates.reduce((sum, state) => sum + state.doppw_verified, 0),
                total_pending_doppw: combinedStates.reduce((sum, state) => sum + state.doppw_pending, 0),
                overall_completion_rate: 0
            };

            const totalDoppw = combinedStates.reduce((sum, state) => sum + state.doppw_total, 0);
            if (totalDoppw > 0) {
                summary.overall_completion_rate = parseFloat(((summary.total_verified_doppw / totalDoppw) * 100).toFixed(2));
            }

            res.status(200).json({
                success: true,
                summary: summary,
                states: combinedStates
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /geography/states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive state data from all tables'
        });
    }
});



// New comprehensive endpoint to get state details from all database tables
app.get('/api/pensioners/comprehensive-state-details/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName) {
            return res.status(400).json({
                error: 'State name is required'
            });
        }

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get data from doppw_pensioner_data table
            const doppwData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending,
                        COUNT(DISTINCT pensioner_district) as totalDistricts,
                        COUNT(DISTINCT pensioner_pincode) as totalPincodes
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_state IS NOT NULL AND pensioner_state != 'nan'
                `;
                db.get(query, [stateName], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                        resolve({
                            tableName: 'doppw_pensioner_data',
                            total: row.total,
                            verified: row.verified,
                            pending: row.pending,
                            totalDistricts: row.totalDistricts,
                            totalPincodes: row.totalPincodes,
                            completionPercentage: parseFloat(completionPercentage)
                        });
                    }
                });
            });

            // Get district level statistics from doppw_pensioner_data
            const doppwDistrictStats = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_district as district,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_district IS NOT NULL AND pensioner_district != 'nan'
                    GROUP BY pensioner_district
                    ORDER BY verified DESC
                `;
                db.all(query, [stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                            return {
                                district: row.district,
                                total: row.total,
                                verified: row.verified,
                                pending: row.pending,
                                completionPercentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            // Get pincode level statistics from doppw_pensioner_data (top 20)
            const doppwPincodeStats = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_pincode as pincode,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_pincode IS NOT NULL AND pensioner_pincode != 'nan'
                    GROUP BY pensioner_pincode
                    ORDER BY verified DESC
                    LIMIT 20
                `;
                db.all(query, [stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total > 0 ? ((row.verified / row.total) * 100).toFixed(2) : 0;
                            return {
                                pincode: row.pincode,
                                total: row.total,
                                verified: row.verified,
                                pending: row.pending,
                                completionPercentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            // Get data from dot_pensioner_data table (if available)
            const dotData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        COUNT(DISTINCT pensioner_pincode) as totalPincodes,
                        COUNT(DISTINCT pda_pincode) as totalPdaPincodes
                    FROM dot_pensioner_data
                    WHERE pensioner_state = ? AND pensioner_state IS NOT NULL AND pensioner_state != 'nan'
                `;
                db.get(query, [stateName], (err, row) => {
                    if (err) {
                        // If table doesn't exist or has issues, return empty data
                        resolve({
                            tableName: 'dot_pensioner_data',
                            total: 0,
                            totalPincodes: 0,
                            totalPdaPincodes: 0
                        });
                    } else {
                        resolve({
                            tableName: 'dot_pensioner_data',
                            total: row.total,
                            totalPincodes: row.totalPincodes,
                            totalPdaPincodes: row.totalPdaPincodes
                        });
                    }
                });
            });

            // Get data from bank_pensioner_data table (if available)
            const bankData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        SUM(grand_total) as grandTotal
                    FROM bank_pensioner_data
                    WHERE state = ? AND state IS NOT NULL AND state != 'nan'
                `;
                db.get(query, [stateName], (err, row) => {
                    if (err) {
                        // If table doesn't exist or has issues, return empty data
                        resolve({
                            tableName: 'bank_pensioner_data',
                            total: 0,
                            grandTotal: 0
                        });
                    } else {
                        resolve({
                            tableName: 'bank_pensioner_data',
                            total: row.total,
                            grandTotal: row.grandTotal
                        });
                    }
                });
            });

            // Get data from psa_pensioner_data table (if available)
            const psaData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        COUNT(*) as total,
                        SUM(total_pensioners) as totalPensioners
                    FROM psa_pensioner_data
                    WHERE location_name = ? AND location_name IS NOT NULL AND location_name != 'nan'
                `;
                db.get(query, [stateName], (err, row) => {
                    if (err) {
                        // If table doesn't exist or has issues, return empty data
                        resolve({
                            tableName: 'psa_pensioner_data',
                            total: 0,
                            totalPensioners: 0
                        });
                    } else {
                        resolve({
                            tableName: 'psa_pensioner_data',
                            total: row.total,
                            totalPensioners: row.totalPensioners
                        });
                    }
                });
            });

            res.status(200).json({
                state: stateName,
                tables: {
                    doppw_pensioner_data: doppwData,
                    dot_pensioner_data: dotData,
                    bank_pensioner_data: bankData,
                    psa_pensioner_data: psaData
                },
                districtStats: doppwDistrictStats,
                pincodeStats: doppwPincodeStats
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/comprehensive-state-details/:stateName:', error);
        res.status(500).json({
            error: 'Failed to fetch comprehensive state details'
        });
    }
});

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
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

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

// Protected dashboard endpoint
app.get('/api/dashboard/protected-stats', authenticateToken, async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.status(200).json({
            success: true,
            data: {
                totalPensioners: stats.totalPensioners,
                summary: {
                    total: stats.summary.total,
                    verified: stats.summary.verified,
                    pending: stats.summary.pending,
                    verificationRate: stats.summary.verificationRate
                },
                ageDistribution: stats.ageDistribution
            }
        });
    } catch (error) {
        console.error('Error in /api/dashboard/protected-stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
});

// New API endpoint for state-wise district/city pensioner counts from ALL tables
app.get('/api/proxy/advanced/cross-tabulation/bank_name/PSA', async (req, res) => {
    try {
        const { state, limit = 25 } = req.query;

        if (!state) {
            return res.status(400).json({
                success: false,
                error: 'State parameter is required'
            });
        }

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get district/city-wise data from ALL tables
            const allDistrictData = await new Promise((resolve, reject) => {
                const query = `
                    -- Data from doppw_pensioner_data (main verification table)
                    SELECT 
                        pensioner_district as district_city,
                        pensioner_state as state,
                        COUNT(*) as total_pensioners,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_pensioners,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending_pensioners,
                        'doppw_pensioner_data' as source_table
                    FROM doppw_pensioner_data
                    WHERE UPPER(pensioner_state) = UPPER(?) 
                        AND pensioner_district IS NOT NULL 
                        AND pensioner_district != 'nan' 
                        AND pensioner_district != ''
                    GROUP BY pensioner_district, pensioner_state
                    
                    UNION ALL
                    
                    -- Data from bank_pensioner_data (bank city data)
                    SELECT 
                        bank_city as district_city,
                        bank_state as state,
                        SUM(grand_total) as total_pensioners,
                        0 as verified_pensioners,
                        0 as pending_pensioners,
                        'bank_pensioner_data' as source_table
                    FROM bank_pensioner_data
                    WHERE UPPER(bank_state) = UPPER(?) 
                        AND bank_city IS NOT NULL 
                        AND bank_city != 'nan' 
                        AND bank_city != ''
                        AND grand_total > 0
                    GROUP BY bank_city, bank_state
                    
                    UNION ALL
                    
                    -- Data from ubi1_pensioner_data (pensioner city data)
                    SELECT 
                        pensioner_city as district_city,
                        pensioner_state as state,
                        COUNT(*) as total_pensioners,
                        0 as verified_pensioners,
                        0 as pending_pensioners,
                        'ubi1_pensioner_data' as source_table
                    FROM ubi1_pensioner_data
                    WHERE UPPER(pensioner_state) = UPPER(?) 
                        AND pensioner_city IS NOT NULL 
                        AND pensioner_city != 'nan' 
                        AND pensioner_city != ''
                    GROUP BY pensioner_city, pensioner_state
                    
                    UNION ALL
                    
                    -- Data from ubi3_pensioner_data (pensioner city data)
                    SELECT 
                        pensioner_city as district_city,
                        pensioner_state as state,
                        COUNT(*) as total_pensioners,
                        0 as verified_pensioners,
                        0 as pending_pensioners,
                        'ubi3_pensioner_data' as source_table
                    FROM ubi3_pensioner_data
                    WHERE UPPER(pensioner_state) = UPPER(?) 
                        AND pensioner_city IS NOT NULL 
                        AND pensioner_city != 'nan' 
                        AND pensioner_city != ''
                    GROUP BY pensioner_city, pensioner_state
                    
                    UNION ALL
                    
                    -- Data from psa_pensioner_data (district level data)
                    SELECT 
                        location_name as district_city,
                        ? as state,
                        total_pensioners as total_pensioners,
                        manual_lc_submitted as verified_pensioners,
                        (total_pensioners - manual_lc_submitted) as pending_pensioners,
                        'psa_pensioner_data' as source_table
                    FROM psa_pensioner_data
                    WHERE data_type = 'district' 
                        AND location_name IS NOT NULL 
                        AND location_name != 'nan' 
                        AND location_name != ''
                        AND total_pensioners > 0
                `;

                db.all(query, [state, state, state, state, state.toUpperCase()], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Combine data from multiple tables for same districts/cities
                        const districtMap = new Map();

                        rows.forEach(row => {
                            const key = row.district_city.toUpperCase().trim();
                            if (districtMap.has(key)) {
                                const existing = districtMap.get(key);
                                existing.total_pensioners += row.total_pensioners || 0;
                                existing.verified_pensioners += row.verified_pensioners || 0;
                                existing.pending_pensioners += row.pending_pensioners || 0;
                                existing.source_tables.push(row.source_table);
                            } else {
                                districtMap.set(key, {
                                    district_city: row.district_city,
                                    state: row.state,
                                    total_pensioners: row.total_pensioners || 0,
                                    verified_pensioners: row.verified_pensioners || 0,
                                    pending_pensioners: row.pending_pensioners || 0,
                                    source_tables: [row.source_table]
                                });
                            }
                        });

                        // Convert map to array and calculate percentages
                        const combinedData = Array.from(districtMap.values()).map(district => {
                            const completionPercentage = district.total_pensioners > 0 ?
                                ((district.verified_pensioners / district.total_pensioners) * 100).toFixed(2) : 0;
                            return {
                                district_city: district.district_city,
                                state: district.state,
                                total_pensioners: district.total_pensioners,
                                verified_pensioners: district.verified_pensioners,
                                pending_pensioners: district.pending_pensioners,
                                completion_percentage: parseFloat(completionPercentage),
                                data_sources: district.source_tables
                            };
                        });

                        // Sort by total pensioners descending and apply limit
                        combinedData.sort((a, b) => b.total_pensioners - a.total_pensioners);

                        resolve(combinedData.slice(0, parseInt(limit)));
                    }
                });
            });

            // Get overall state summary from all tables
            const stateSummary = await new Promise((resolve, reject) => {
                const summaryQuery = `
                    SELECT 
                        SUM(total_pensioners) as total_pensioners,
                        SUM(verified_pensioners) as verified_pensioners,
                        SUM(pending_pensioners) as pending_pensioners,
                        COUNT(*) as total_locations
                    FROM (
                        -- Summary from doppw_pensioner_data
                        SELECT 
                            COUNT(*) as total_pensioners,
                            SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_pensioners,
                            SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending_pensioners
                        FROM doppw_pensioner_data
                        WHERE UPPER(pensioner_state) = UPPER(?)
                        
                        UNION ALL
                        
                        -- Summary from bank_pensioner_data
                        SELECT 
                            SUM(grand_total) as total_pensioners,
                            0 as verified_pensioners,
                            0 as pending_pensioners
                        FROM bank_pensioner_data
                        WHERE UPPER(bank_state) = UPPER(?) AND grand_total > 0
                        
                        UNION ALL
                        
                        -- Summary from ubi1_pensioner_data
                        SELECT 
                            COUNT(*) as total_pensioners,
                            0 as verified_pensioners,
                            0 as pending_pensioners
                        FROM ubi1_pensioner_data
                        WHERE UPPER(pensioner_state) = UPPER(?)
                        
                        UNION ALL
                        
                        -- Summary from ubi3_pensioner_data
                        SELECT 
                            COUNT(*) as total_pensioners,
                            0 as verified_pensioners,
                            0 as pending_pensioners
                        FROM ubi3_pensioner_data
                        WHERE UPPER(pensioner_state) = UPPER(?)
                        
                        UNION ALL
                        
                        -- Summary from psa_pensioner_data
                        SELECT 
                            SUM(total_pensioners) as total_pensioners,
                            SUM(manual_lc_submitted) as verified_pensioners,
                            SUM(total_pensioners - manual_lc_submitted) as pending_pensioners
                        FROM psa_pensioner_data
                        WHERE data_type = 'district' AND total_pensioners > 0
                    )
                `;

                db.get(summaryQuery, [state, state, state, state], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        const completionPercentage = row.total_pensioners > 0 ?
                            ((row.verified_pensioners / row.total_pensioners) * 100).toFixed(2) : 0;
                        resolve({
                            state: state.toUpperCase(),
                            total_pensioners: row.total_pensioners || 0,
                            verified_pensioners: row.verified_pensioners || 0,
                            pending_pensioners: row.pending_pensioners || 0,
                            total_locations: allDistrictData.length,
                            completion_percentage: parseFloat(completionPercentage)
                        });
                    }
                });
            });

            res.status(200).json({
                success: true,
                query_parameters: {
                    state: state.toUpperCase(),
                    limit: parseInt(limit)
                },
                state_summary: stateSummary,
                district_city_wise_data: allDistrictData,
                total_records_returned: allDistrictData.length,
                data_sources: [
                    'doppw_pensioner_data (main verification table)',
                    'bank_pensioner_data (bank city wise)',
                    'ubi1_pensioner_data (pensioner city wise)',
                    'ubi3_pensioner_data (pensioner city wise)',
                    'psa_pensioner_data (district wise)'
                ],
                message: `District/City-wise pensioner data for ${state.toUpperCase()} state from all database tables`
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/proxy/advanced/cross-tabulation/bank_name/PSA:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch district-wise pensioner data from all tables',
            details: error.message
        });
    }
});

// Simpler endpoint for state-wise district data (using same logic as main endpoint)
app.get('/api/state/:stateName/districts', async (req, res) => {
    try {
        const { stateName } = req.params;
        const { limit = 50 } = req.query;

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get district data from doppw_pensioner_data (main table)
            const districtData = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_district as district_city,
                        pensioner_state as state,
                        COUNT(*) as total_pensioners,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_pensioners,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending_pensioners
                    FROM doppw_pensioner_data
                    WHERE UPPER(pensioner_state) = UPPER(?) 
                        AND pensioner_district IS NOT NULL 
                        AND pensioner_district != 'nan' 
                        AND pensioner_district != ''
                    GROUP BY pensioner_district, pensioner_state
                    ORDER BY total_pensioners DESC
                    LIMIT ?
                `;

                db.all(query, [stateName, parseInt(limit)], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        const statsWithPercentage = rows.map(row => {
                            const completionPercentage = row.total_pensioners > 0 ?
                                ((row.verified_pensioners / row.total_pensioners) * 100).toFixed(2) : 0;
                            return {
                                district_city: row.district_city,
                                state: row.state,
                                total_pensioners: row.total_pensioners,
                                verified_pensioners: row.verified_pensioners,
                                pending_pensioners: row.pending_pensioners,
                                completion_percentage: parseFloat(completionPercentage)
                            };
                        });
                        resolve(statsWithPercentage);
                    }
                });
            });

            res.status(200).json({
                success: true,
                state: stateName.toUpperCase(),
                districts: districtData,
                total_districts: districtData.length,
                limit_applied: parseInt(limit)
            });

        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/state/:stateName/districts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch district data for state',
            details: error.message
        });
    }
});

// CORRECTED Geography API - Get all states data with proper case-insensitive matching
app.get('/geography/states', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        const closeDb = () => {
            db.close(err => {
                if (err) {
                    console.warn('Warning: failed to close database connection', err.message);
                }
            });
        };

        try {
            // Get state-wise data from doppw_pensioner_data (main verification table)
            const doppwStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total,
                        SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified,
                        SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending
                    FROM doppw_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                    ORDER BY total DESC
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            doppw_total: row.total,
                            doppw_verified: row.verified,
                            doppw_pending: row.pending,
                            doppw_completion_rate: row.total > 0 ? parseFloat(((row.verified / row.total) * 100).toFixed(2)) : 0
                        })));
                    }
                });
            });

            // Get state-wise data from bank_pensioner_data
            const bankStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        bank_state as state,
                        COUNT(*) as records,
                        SUM(COALESCE(grand_total, 0)) as total_pensioners
                    FROM bank_pensioner_data
                    WHERE bank_state IS NOT NULL AND bank_state != 'nan' AND bank_state != ''
                    GROUP BY bank_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('Bank table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            bank_records: row.records,
                            bank_total_pensioners: row.total_pensioners
                        })));
                    }
                });
            });

            // Get comprehensive PSA data (both state and district level) with district-to-state mapping
            const psaStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        location_name,
                        data_type,
                        COUNT(*) as records,
                        SUM(COALESCE(total_pensioners, 0)) as total_pensioners
                    FROM psa_pensioner_data
                    WHERE location_name IS NOT NULL AND location_name != 'nan' AND location_name != ''
                    GROUP BY location_name, data_type
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('PSA table query failed:', err.message);
                        resolve([]);
                    } else {
                        // Create district to state mapping for major districts
                        const districtToStateMapping = {
                            // Delhi districts
                            'Central Delhi': 'Delhi', 'EastDelhi': 'Delhi', 'East Delhi': 'Delhi',
                            'North Delhi': 'Delhi', 'North-EastDelhi': 'Delhi', 'North-East Delhi': 'Delhi',
                            'North-West Delhi': 'Delhi', 'South Delhi': 'Delhi', 'West Delhi': 'Delhi',
                            'New Delhi': 'Delhi', 'South-West Delhi': 'Delhi', 'South-East Delhi': 'Delhi',
                            'South-WestDelhi': 'Delhi', 'South-EastDelhi': 'Delhi',

                            // Haryana districts
                            'Gurugram': 'Haryana', 'Jhajjar': 'Haryana', 'Sonipat': 'Haryana',
                            'Faridabad': 'Haryana', 'Panipat': 'Haryana', 'Rohtak': 'Haryana',
                            'Hisar': 'Haryana', 'Karnal': 'Haryana', 'Ambala': 'Haryana',
                            'Palwal': 'Haryana', 'Rewari': 'Haryana',

                            // UP districts  
                            'Ghaziabad': 'Uttar Pradesh', 'Lucknow': 'Uttar Pradesh', 'Kanpur': 'Uttar Pradesh',
                            'Agra': 'Uttar Pradesh', 'Varanasi': 'Uttar Pradesh', 'Meerut': 'Uttar Pradesh',
                            'Allahabad': 'Uttar Pradesh', 'Bareilly': 'Uttar Pradesh', 'Moradabad': 'Uttar Pradesh',
                            'Saharanpur': 'Uttar Pradesh', 'Gorakhpur': 'Uttar Pradesh', 'Noida': 'Uttar Pradesh',
                            'Gautam Buddha Nagar': 'Uttar Pradesh', 'Baghpat': 'Uttar Pradesh',

                            // Maharashtra districts
                            'Mumbai': 'Maharashtra', 'Pune': 'Maharashtra', 'Nagpur': 'Maharashtra',
                            'Thane': 'Maharashtra', 'Nashik': 'Maharashtra', 'Aurangabad': 'Maharashtra',
                            'Mumbai Suburban': 'Maharashtra',

                            // Karnataka districts
                            'Bangalore': 'Karnataka', 'Bengaluru': 'Karnataka', 'Mysore': 'Karnataka',
                            'Bengaluru Urban': 'Karnataka', 'Mysuru': 'Karnataka', 'Hubli': 'Karnataka',
                            'Mangalore': 'Karnataka', 'Belgaum': 'Karnataka', 'Gulbarga': 'Karnataka',

                            // Tamil Nadu districts
                            'Chennai': 'Tamil Nadu', 'Coimbatore': 'Tamil Nadu', 'Madurai': 'Tamil Nadu',

                            // Other major districts
                            'Hyderabad': 'Telangana', 'Kolkata': 'West Bengal', 'Ahmedabad': 'Gujarat',
                            'Jaipur': 'Rajasthan', 'Alwar': 'Rajasthan', 'Bhopal': 'Madhya Pradesh', 'Patna': 'Bihar',
                            'Bhubaneswar': 'Odisha', 'Chandigarh': 'Chandigarh', 'Dehradun': 'Uttarakhand',
                            'Raipur': 'Chhattisgarh', 'Ranchi': 'Jharkhand', 'Guwahati': 'Assam'
                        };

                        // Aggregate PSA data by state
                        const stateAggregation = new Map();

                        rows.forEach(row => {
                            let stateName = row.location_name;

                            // If it's a district, map it to state
                            if (row.data_type === 'district') {
                                stateName = districtToStateMapping[row.location_name];
                                // Skip unmapped districts
                                if (!stateName) return;
                            }

                            // Skip non-state categories
                            const skipCategories = [
                                'Concerned State Government', 'Central Government',
                                'State Government', 'Others', 'Total'
                            ];

                            if (!skipCategories.includes(stateName)) {
                                const normalizedStateName = stateName.toUpperCase();
                                if (stateAggregation.has(normalizedStateName)) {
                                    const existing = stateAggregation.get(normalizedStateName);
                                    existing.psa_records += row.records;
                                    existing.psa_total_pensioners += row.total_pensioners;
                                } else {
                                    stateAggregation.set(normalizedStateName, {
                                        state: stateName,
                                        psa_records: row.records,
                                        psa_total_pensioners: row.total_pensioners
                                    });
                                }
                            }
                        });

                        resolve(Array.from(stateAggregation.values()));
                    }
                });
            });

            // Combine all state data with case-insensitive matching
            const allStatesMap = new Map();

            // Add doppw data (main table with verification status)
            doppwStates.forEach(state => {
                const normalizedKey = state.state.toUpperCase();
                allStatesMap.set(normalizedKey, {
                    ...state,
                    displayName: state.state // Keep original case for display
                });
            });

            // Add bank data with case-insensitive matching
            bankStates.forEach(state => {
                const normalizedKey = state.state.toUpperCase();
                if (allStatesMap.has(normalizedKey)) {
                    const existing = allStatesMap.get(normalizedKey);
                    existing.bank_records = state.bank_records;
                    existing.bank_total_pensioners = state.bank_total_pensioners;
                } else {
                    allStatesMap.set(normalizedKey, {
                        state: state.state,
                        displayName: state.state,
                        bank_records: state.bank_records,
                        bank_total_pensioners: state.bank_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add psa data with case-insensitive matching
            psaStates.forEach(state => {
                const normalizedKey = state.state.toUpperCase();
                if (allStatesMap.has(normalizedKey)) {
                    const existing = allStatesMap.get(normalizedKey);
                    existing.psa_records = (existing.psa_records || 0) + state.psa_records;
                    existing.psa_total_pensioners = (existing.psa_total_pensioners || 0) + state.psa_total_pensioners;
                } else {
                    allStatesMap.set(normalizedKey, {
                        state: state.state,
                        displayName: state.state,
                        psa_records: state.psa_records,
                        psa_total_pensioners: state.psa_total_pensioners,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Get state-wise data from ubi3_pensioner_data
            const ubi3States = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total
                    FROM ubi3_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('UBI3 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            ubi3_total: row.total
                        })));
                    }
                });
            });

            // Get state-wise data from ubi1_pensioner_data
            const ubi1States = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total
                    FROM ubi1_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('UBI1 table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            ubi1_total: row.total
                        })));
                    }
                });
            });

            // Add ubi3 data with case-insensitive matching
            ubi3States.forEach(state => {
                const normalizedKey = state.state.toUpperCase();
                if (allStatesMap.has(normalizedKey)) {
                    const existing = allStatesMap.get(normalizedKey);
                    existing.ubi3_total = state.ubi3_total;
                } else {
                    allStatesMap.set(normalizedKey, {
                        state: state.state,
                        displayName: state.state,
                        ubi3_total: state.ubi3_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Add ubi1 data with case-insensitive matching
            ubi1States.forEach(state => {
                const normalizedKey = state.state.toUpperCase();
                if (allStatesMap.has(normalizedKey)) {
                    const existing = allStatesMap.get(normalizedKey);
                    existing.ubi1_total = state.ubi1_total;
                } else {
                    allStatesMap.set(normalizedKey, {
                        state: state.state,
                        displayName: state.state,
                        ubi1_total: state.ubi1_total,
                        doppw_total: 0, doppw_verified: 0, doppw_pending: 0, doppw_completion_rate: 0
                    });
                }
            });

            // Convert map to array and calculate combined totals
            const combinedStates = Array.from(allStatesMap.values()).map(state => {
                const combinedTotal = (state.doppw_total || 0) +
                    (state.bank_total_pensioners || 0) +
                    (state.psa_total_pensioners || 0) +
                    (state.ubi3_total || 0) +
                    (state.ubi1_total || 0);

                return {
                    state: state.displayName, // Use original case for display
                    doppw_total: state.doppw_total || 0,
                    doppw_verified: state.doppw_verified || 0,
                    doppw_pending: state.doppw_pending || 0,
                    doppw_completion_rate: state.doppw_completion_rate || 0,
                    bank_records: state.bank_records || 0,
                    bank_total_pensioners: state.bank_total_pensioners || 0,
                    psa_records: state.psa_records || 0,
                    psa_total_pensioners: state.psa_total_pensioners || 0,
                    ubi3_total: state.ubi3_total || 0,
                    ubi1_total: state.ubi1_total || 0,
                    combined_total_pensioners: combinedTotal
                };
            });

            // Sort by combined total (descending)
            combinedStates.sort((a, b) => b.combined_total_pensioners - a.combined_total_pensioners);

            res.status(200).json({
                success: true,
                states: combinedStates,
                note: "CORRECTED ENDPOINT - case-insensitive state matching",
                endpoint_version: "corrected_v2"
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /geography/states-corrected:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive state data from all tables'
        });
    }
});

// ==========================================
// NEW GEOGRAPHIC ANALYSIS API ENDPOINTS
// ==========================================

/**
 * Main Geographic Analysis API - Get state-wise districts and pincodes with pensioner data
 * Usage: GET /api/geographic/state-analysis/:stateName
 * Example: GET /api/geographic/state-analysis/KARNATAKA
 */
app.get('/api/geographic/state-analysis/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName || stateName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'State name is required',
                usage: 'GET /api/geographic/state-analysis/:stateName',
                example: 'GET /api/geographic/state-analysis/KARNATAKA'
            });
        }

        console.log(`Geographic analysis requested for state: ${stateName}`);

        const geoData = await getStateGeographicAnalysis(stateName);

        res.status(200).json({
            success: true,
            message: `Geographic analysis for ${stateName.toUpperCase()}`,
            data: geoData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in /api/geographic/state-analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch geographic analysis data',
            details: error.message
        });
    }
});

/**
 * Get all available states for geographic analysis
 * Usage: GET /api/geographic/available-states
 */
app.get('/api/geographic/available-states', async (req, res) => {
    try {
        const states = await getAllAvailableStates();

        res.status(200).json({
            success: true,
            message: 'Available states for geographic analysis',
            states: states,
            totalStates: states.length,
            usage: 'Use these state names with /api/geographic/state-analysis/:stateName',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in /api/geographic/available-states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch available states',
            details: error.message
        });
    }
});

/**
 * Quick summary API - Get basic counts for a state
 * Usage: GET /api/geographic/quick-summary/:stateName
 */
app.get('/api/geographic/quick-summary/:stateName', async (req, res) => {
    try {
        const { stateName } = req.params;

        if (!stateName || stateName.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'State name is required'
            });
        }

        const geoData = await getStateGeographicAnalysis(stateName);

        // Create quick summary
        const quickSummary = {
            state: geoData.state,
            totalDistricts: geoData.totalDistricts,
            totalPincodes: geoData.totalPincodes,
            totalPensioners: geoData.totalPensioners,
            topDistricts: geoData.districts.slice(0, 5).map(district => ({
                district: district.district,
                totalPensioners: district.totalPensioners,
                totalPincodes: district.totalPincodes,
                verificationRate: district.verificationRate
            })),
            dataSources: geoData.summary.dataSources
        };

        res.status(200).json({
            success: true,
            message: `Quick summary for ${stateName.toUpperCase()}`,
            summary: quickSummary,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in /api/geographic/quick-summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quick summary',
            details: error.message
        });
    }
});

/**
 * District details API - Get detailed info for a specific district in a state
 * Usage: GET /api/geographic/district-details/:stateName/:districtName
 */
app.get('/api/geographic/district-details/:stateName/:districtName', async (req, res) => {
    try {
        const { stateName, districtName } = req.params;

        if (!stateName || !districtName) {
            return res.status(400).json({
                success: false,
                error: 'Both state name and district name are required',
                usage: 'GET /api/geographic/district-details/:stateName/:districtName'
            });
        }

        const geoData = await getStateGeographicAnalysis(stateName);

        // Find the specific district
        const district = geoData.districts.find(d =>
            d.district.toUpperCase() === districtName.toUpperCase()
        );

        if (!district) {
            return res.status(404).json({
                success: false,
                error: `District '${districtName}' not found in state '${stateName}'`,
                availableDistricts: geoData.districts.map(d => d.district)
            });
        }

        res.status(200).json({
            success: true,
            message: `District details for ${districtName} in ${stateName}`,
            state: geoData.state,
            district: district,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in /api/geographic/district-details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch district details',
            details: error.message
        });
    }
});

// ============================================================================
// BANK ANALYSIS API ENDPOINTS
// ============================================================================

// Bank Analysis API - Comprehensive bank-wise pensioner verification data
app.get('/api/bank-analysis', async (req, res) => {
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

    // Build individual WHERE clauses for each table
    let bankWhereClause = 'WHERE bank_name IS NOT NULL AND bank_name != \'\'';
    let ubi1WhereClause = 'WHERE bank_name IS NOT NULL AND bank_name != \'\'';
    let ubi3WhereClause = 'WHERE bank_name IS NOT NULL AND bank_name != \'\'';
    let doppwWhereClause = 'WHERE branch_name IS NOT NULL AND branch_name != \'\'';

    let bankParams = [];
    let ubi1Params = [];
    let ubi3Params = [];
    let doppwParams = [];

    if (state) {
        bankWhereClause += ' AND bank_state LIKE ?';
        bankParams.push(`%${state}%`);

        ubi1WhereClause += ' AND pensioner_state LIKE ?';
        ubi1Params.push(`%${state}%`);

        ubi3WhereClause += ' AND pensioner_state LIKE ?';
        ubi3Params.push(`%${state}%`);

        doppwWhereClause += ' AND branch_state LIKE ?';
        doppwParams.push(`%${state}%`);
    }

    if (district) {
        bankWhereClause += ' AND bank_city LIKE ?';
        bankParams.push(`%${district}%`);

        ubi1WhereClause += ' AND pensioner_city LIKE ?';
        ubi1Params.push(`%${district}%`);

        ubi3WhereClause += ' AND pensioner_city LIKE ?';
        ubi3Params.push(`%${district}%`);

        doppwWhereClause += ' AND pensioner_district LIKE ?';
        doppwParams.push(`%${district}%`);
    }

    if (pincode) {
        bankWhereClause += ' AND branch_pin_code LIKE ?';
        bankParams.push(`%${pincode}%`);

        ubi1WhereClause += ' AND pensioner_pincode LIKE ?';
        ubi1Params.push(`%${pincode}%`);

        ubi3WhereClause += ' AND pensioner_pincode LIKE ?';
        ubi3Params.push(`%${pincode}%`);

        doppwWhereClause += ' AND pensioner_pincode LIKE ?';
        doppwParams.push(`%${pincode}%`);
    }

    if (bank_name) {
        bankWhereClause += ' AND bank_name LIKE ?';
        bankParams.push(`%${bank_name}%`);

        ubi1WhereClause += ' AND bank_name LIKE ?';
        ubi1Params.push(`%${bank_name}%`);

        ubi3WhereClause += ' AND bank_name LIKE ?';
        ubi3Params.push(`%${bank_name}%`);

        doppwWhereClause += ' AND branch_name LIKE ?';
        doppwParams.push(`%${bank_name}%`);
    }

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
            ${bankWhereClause}
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
            ${ubi1WhereClause}
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
            ${ubi3WhereClause}
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
            ${doppwWhereClause}
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

    // Combine all parameters in the correct order
    const allParams = [...bankParams, ...ubi1Params, ...ubi3Params, ...doppwParams, parseInt(limit), parseInt(offset)];

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, allParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

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

        const summary = await new Promise((resolve, reject) => {
            db.get(summaryQuery, [], (err, row) => {
                if (err) {
                    console.warn('Summary query error:', err.message);
                    resolve({});
                } else {
                    resolve(row || {});
                }
            });
        });

        res.json({
            success: true,
            data: rows,
            summary: summary,
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
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            success: false,
            error: 'Database query failed',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

// Top Banks API - Get banks with highest verification counts
app.post('/api/top-banks', async (req, res) => {

    const limit = req.body.limit ? parseInt(req.body.limit) : null;
    const filters = req.body.filters;

    let query = `select Bank_name, 
    count(*) as all_pensioner_count, 
    count(LC_date) as verified_pensioner_count, 
    (count(LC_date) * 1.0 / count(*)) * 100 as completion_ratio
    from all_pensioners where bank_name is not null 
    GROUP by bank_name 
    order by completion_ratio desc, all_pensioner_count desc`;

    query = _addLimitClauseIfNeeded(query, req.query.limit)
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
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

// Bank Details API - Get detailed information for a specific bank
app.get('/api/bank-details/:bankName', async (req, res) => {
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

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const results = {};
        const searchPattern = `%${bankName}%`;

        const queryPromises = Object.entries(queries).map(([key, query]) => {
            return new Promise((resolve) => {
                db.all(query, [searchPattern], (err, rows) => {
                    if (err) {
                        console.error(`Error in ${key}:`, err);
                        results[key] = { error: err.message };
                    } else {
                        results[key] = rows || [];
                    }
                    resolve();
                });
            });
        });

        await Promise.all(queryPromises);

        res.json({
            success: true,
            bank_name: bankName,
            data: results
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            success: false,
            error: 'Database query failed',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

// State-wise Bank Distribution API
app.get('/api/state-bank-distribution', async (req, res) => {
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

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
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
            message: 'State-wise bank distribution with pensioner counts'
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            success: false,
            error: 'Database query failed',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

// ============================================================================
// CHOROPLETH MAP DATA API - State-wise Verified Pensioners for Map Visualization
// ============================================================================

// Enhanced Comprehensive State-wise Verified Pensioner Data with Advanced Filtering
app.get('/api/choropleth/state-verification-data', async (req, res) => {
    const {
        age_category,     // '60-70', '70-80', '80+', '<60', 'all'
        bank_name,        // 'SBI', 'CANARA', etc. (partial match)
        pension_type,     // 'Defence', 'Railway', 'Civil', 'all'
        state_filter,     // specific state name (partial match)
        include_details   // 'true' to include detailed bank breakdown
    } = req.query;
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Build dynamic filtering conditions
        let ageFilter = '';
        let bankFilter = '';
        let pensionFilter = '';
        let stateFilterCondition = '';
        let queryParams = [];

        // Age category filtering
        if (age_category && age_category !== 'all') {
            switch (age_category) {
                case '60-70':
                    ageFilter = 'AND age >= 60 AND age < 70';
                    break;
                case '70-80':
                    ageFilter = 'AND age >= 70 AND age < 80';
                    break;
                case '80+':
                    ageFilter = 'AND age >= 80';
                    break;
                case '<60':
                    ageFilter = 'AND age < 60';
                    break;
            }
        }

        // Bank name filtering
        if (bank_name && bank_name !== 'all') {
            bankFilter = 'AND (UPPER(branch_name) LIKE UPPER(?) OR UPPER(bank_name) LIKE UPPER(?))';
            queryParams.push(`%${bank_name}%`, `%${bank_name}%`);
        }

        // Pension type filtering
        if (pension_type && pension_type !== 'all') {
            switch (pension_type.toLowerCase()) {
                case 'defence':
                case 'defense':
                    pensionFilter = 'AND UPPER(pension_type) = ?';
                    queryParams.push('F');
                    break;
                case 'railway':
                    pensionFilter = 'AND UPPER(pension_type) = ?';
                    queryParams.push('R');
                    break;
                case 'civil':
                    pensionFilter = 'AND (UPPER(pension_type) = ? OR UPPER(pension_type) = ?)';
                    queryParams.push('PENSION', 'S');
                    break;
                case 'postal':
                    pensionFilter = 'AND UPPER(pension_type) = ?';
                    queryParams.push('POSTAL');
                    break;
            }
        }

        // State filtering
        if (state_filter && state_filter !== 'all') {
            stateFilterCondition = 'AND UPPER(TRIM(pensioner_state)) LIKE UPPER(?)';
            queryParams.push(`%${state_filter}%`);
        }

        // Enhanced query with filtering capabilities
        const query = `
            WITH comprehensive_state_data AS (
                -- DOPPW Pensioner Data (Main verification table) with filtering
                SELECT 
                    UPPER(TRIM(pensioner_state)) as state_name,
                    'doppw_pensioner_data' as source_table,
                    COUNT(*) as total_pensioners,
                    COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                    COUNT(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 END) as pending_pensioners,
                    COUNT(DISTINCT branch_name) as unique_banks,
                    COUNT(DISTINCT pensioner_district) as unique_districts,
                    COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                    '${age_category || 'all'}' as applied_age_filter,
                    '${bank_name || 'all'}' as applied_bank_filter,
                    '${pension_type || 'all'}' as applied_pension_filter
                FROM doppw_pensioner_data
                WHERE pensioner_state IS NOT NULL 
                    AND pensioner_state != 'nan' 
                    AND pensioner_state != ''
                    AND TRIM(pensioner_state) != ''
                    AND branch_name IS NOT NULL 
                    AND branch_name != 'nan' 
                    AND branch_name != ''
                    ${ageFilter}
                    ${bankFilter}
                    ${pensionFilter}
                    ${stateFilterCondition}
                GROUP BY UPPER(TRIM(pensioner_state))
                
                UNION ALL
                
                -- Bank Pensioner Data (Aggregated bank data) with age category filtering
                SELECT 
                    UPPER(TRIM(bank_state)) as state_name,
                    'bank_pensioner_data' as source_table,
                    ${age_category === '80+' ? 'SUM(COALESCE(age_more_than_80, 0))' :
                age_category === '<80' ? 'SUM(COALESCE(age_less_than_80, 0))' :
                    age_category === 'unknown' ? 'SUM(COALESCE(age_not_available, 0))' :
                        'SUM(COALESCE(grand_total, 0))'} as total_pensioners,
                    ${age_category === '80+' ? 'SUM(COALESCE(age_more_than_80, 0))' :
                age_category === '<80' ? 'SUM(COALESCE(age_less_than_80, 0))' :
                    age_category === 'unknown' ? 'SUM(COALESCE(age_not_available, 0))' :
                        'SUM(COALESCE(grand_total, 0))'} as verified_pensioners,
                    0 as pending_pensioners,
                    COUNT(DISTINCT bank_name) as unique_banks,
                    COUNT(DISTINCT bank_city) as unique_districts,
                    COUNT(DISTINCT branch_pin_code) as unique_pincodes,
                    '${age_category || 'all'}' as applied_age_filter,
                    '${bank_name || 'all'}' as applied_bank_filter,
                    '${pension_type || 'all'}' as applied_pension_filter
                FROM bank_pensioner_data
                WHERE bank_state IS NOT NULL 
                    AND bank_state != 'nan' 
                    AND bank_state != ''
                    AND TRIM(bank_state) != ''
                    ${bank_name && bank_name !== 'all' ? 'AND UPPER(bank_name) LIKE UPPER(?)' : ''}
                    ${state_filter && state_filter !== 'all' ? 'AND UPPER(TRIM(bank_state)) LIKE UPPER(?)' : ''}
                GROUP BY UPPER(TRIM(bank_state))
                
                UNION ALL
                
                -- UBI1 Pensioner Data with filtering
                SELECT 
                    UPPER(TRIM(pensioner_state)) as state_name,
                    'ubi1_pensioner_data' as source_table,
                    COUNT(*) as total_pensioners,
                    COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                    COUNT(CASE WHEN is_valid != 1 OR is_valid IS NULL THEN 1 END) as pending_pensioners,
                    COUNT(DISTINCT bank_name) as unique_banks,
                    COUNT(DISTINCT pensioner_city) as unique_districts,
                    COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                    '${age_category || 'all'}' as applied_age_filter,
                    '${bank_name || 'all'}' as applied_bank_filter,
                    '${pension_type || 'all'}' as applied_pension_filter
                FROM ubi1_pensioner_data
                WHERE pensioner_state IS NOT NULL 
                    AND pensioner_state != 'nan' 
                    AND pensioner_state != ''
                    AND TRIM(pensioner_state) != ''
                    ${ageFilter}
                    ${bank_name && bank_name !== 'all' ? 'AND UPPER(bank_name) LIKE UPPER(?)' : ''}
                    ${state_filter && state_filter !== 'all' ? 'AND UPPER(TRIM(pensioner_state)) LIKE UPPER(?)' : ''}
                GROUP BY UPPER(TRIM(pensioner_state))
                
                UNION ALL
                
                -- UBI3 Pensioner Data with filtering
                SELECT 
                    UPPER(TRIM(pensioner_state)) as state_name,
                    'ubi3_pensioner_data' as source_table,
                    COUNT(*) as total_pensioners,
                    COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                    COUNT(CASE WHEN is_valid != 1 OR is_valid IS NULL THEN 1 END) as pending_pensioners,
                    COUNT(DISTINCT bank_name) as unique_banks,
                    COUNT(DISTINCT pensioner_city) as unique_districts,
                    COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                    '${age_category || 'all'}' as applied_age_filter,
                    '${bank_name || 'all'}' as applied_bank_filter,
                    '${pension_type || 'all'}' as applied_pension_filter
                FROM ubi3_pensioner_data
                WHERE pensioner_state IS NOT NULL 
                    AND pensioner_state != 'nan' 
                    AND pensioner_state != ''
                    AND TRIM(pensioner_state) != ''
                    ${ageFilter}
                    ${bank_name && bank_name !== 'all' ? 'AND UPPER(bank_name) LIKE UPPER(?)' : ''}
                    ${state_filter && state_filter !== 'all' ? 'AND UPPER(TRIM(pensioner_state)) LIKE UPPER(?)' : ''}
                GROUP BY UPPER(TRIM(pensioner_state))
                
                UNION ALL
                
                -- PSA Pensioner Data (State level data)
                SELECT 
                    UPPER(TRIM(location_name)) as state_name,
                    'psa_pensioner_data' as source_table,
                    SUM(COALESCE(total_pensioners, 0)) as total_pensioners,
                    SUM(COALESCE(manual_lc_submitted, 0)) as verified_pensioners,
                    SUM(COALESCE(total_pensioners, 0) - COALESCE(manual_lc_submitted, 0)) as pending_pensioners,
                    1 as unique_banks,
                    1 as unique_districts,
                    1 as unique_pincodes
                FROM psa_pensioner_data
                WHERE data_type = 'state'
                    AND location_name IS NOT NULL 
                    AND location_name != 'nan' 
                    AND location_name != ''
                    AND TRIM(location_name) != ''
                    AND location_name NOT IN ('Total', 'Concerned State Government', 'Central Government', 'State Government', 'Others')
                GROUP BY UPPER(TRIM(location_name))
            ),
            
            -- Aggregate all data by state
            state_aggregated AS (
                SELECT 
                    state_name,
                    SUM(total_pensioners) as total_pensioners,
                    SUM(verified_pensioners) as total_verified,
                    SUM(pending_pensioners) as total_pending,
                    SUM(unique_banks) as total_banks,
                    MAX(unique_districts) as total_districts,
                    MAX(unique_pincodes) as total_pincodes,
                    COUNT(DISTINCT source_table) as data_sources_count,
                    GROUP_CONCAT(DISTINCT source_table) as data_sources
                FROM comprehensive_state_data
                GROUP BY state_name
            )
            
            SELECT 
                state_name,
                total_pensioners,
                total_verified,
                total_pending,
                total_banks,
                total_districts,
                total_pincodes,
                ROUND((total_verified * 100.0 / NULLIF(total_pensioners, 0)), 2) as verification_percentage,
                ROUND((total_verified * 100.0 / (SELECT SUM(total_verified) FROM state_aggregated)), 2) as share_of_national_verified,
                ROUND((total_banks * 100.0 / (SELECT SUM(total_banks) FROM state_aggregated)), 2) as share_of_national_banks,
                data_sources_count,
                data_sources,
                -- Categorize states for choropleth visualization
                CASE 
                    WHEN total_verified >= 100000 THEN 'Very High'
                    WHEN total_verified >= 50000 THEN 'High'
                    WHEN total_verified >= 20000 THEN 'Medium'
                    WHEN total_verified >= 5000 THEN 'Low'
                    ELSE 'Very Low'
                END as verification_category,
                -- Bank density category
                CASE 
                    WHEN total_banks >= 1000 THEN 'Very High Bank Density'
                    WHEN total_banks >= 500 THEN 'High Bank Density'
                    WHEN total_banks >= 100 THEN 'Medium Bank Density'
                    WHEN total_banks >= 50 THEN 'Low Bank Density'
                    ELSE 'Very Low Bank Density'
                END as bank_density_category,
                -- Rank states by verification count
                RANK() OVER (ORDER BY total_verified DESC) as verification_rank,
                -- Rank states by bank count
                RANK() OVER (ORDER BY total_banks DESC) as bank_count_rank
            FROM state_aggregated
            WHERE state_name IS NOT NULL 
                AND state_name != ''
                AND total_pensioners > 0
            ORDER BY total_verified DESC
        `;

        // Build complete parameter array for all UNION queries
        let allParams = [];

        // Parameters for DOPPW query
        allParams = allParams.concat(queryParams);

        // Parameters for bank_pensioner_data query
        if (bank_name && bank_name !== 'all') {
            allParams.push(`%${bank_name}%`);
        }
        if (state_filter && state_filter !== 'all') {
            allParams.push(`%${state_filter}%`);
        }

        // Parameters for UBI1 query
        if (bank_name && bank_name !== 'all') {
            allParams.push(`%${bank_name}%`);
        }
        if (state_filter && state_filter !== 'all') {
            allParams.push(`%${state_filter}%`);
        }

        // Parameters for UBI3 query
        if (bank_name && bank_name !== 'all') {
            allParams.push(`%${bank_name}%`);
        }
        if (state_filter && state_filter !== 'all') {
            allParams.push(`%${state_filter}%`);
        }

        const stateData = await new Promise((resolve, reject) => {
            db.all(query, allParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get detailed bank breakdown if requested
        let topStatesWithBankDetails = [];

        if (include_details === 'true') {
            topStatesWithBankDetails = await Promise.all(
                stateData.slice(0, 10).map(async (state) => {
                    try {
                        // Build filtered bank query
                        let bankDetailQuery = `
                            SELECT 
                                branch_name as bank_name,
                                COUNT(*) as pensioner_count,
                                COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_count,
                                ROUND(AVG(age), 1) as avg_age,
                                pension_type,
                                COUNT(DISTINCT pensioner_district) as districts_covered
                            FROM doppw_pensioner_data
                            WHERE UPPER(TRIM(pensioner_state)) = ?
                                AND branch_name IS NOT NULL 
                                AND branch_name != 'nan' 
                                AND branch_name != ''
                                ${ageFilter}
                                ${pensionFilter}
                                ${bank_name && bank_name !== 'all' ? 'AND UPPER(branch_name) LIKE UPPER(?)' : ''}
                            GROUP BY branch_name, pension_type
                            ORDER BY pensioner_count DESC
                            LIMIT 10
                        `;

                        let bankParams = [state.state_name];
                        if (bank_name && bank_name !== 'all') {
                            bankParams.push(`%${bank_name}%`);
                        }

                        const topBanks = await new Promise((resolve, reject) => {
                            db.all(bankDetailQuery, bankParams, (err, rows) => {
                                if (err) {
                                    resolve([]);
                                } else {
                                    resolve(rows || []);
                                }
                            });
                        });

                        return {
                            ...state,
                            top_banks: topBanks
                        };
                    } catch (error) {
                        return {
                            ...state,
                            top_banks: []
                        };
                    }
                })
            );
        }


        // Format enhanced data for choropleth map
        const choroplethData = stateData.map(state => ({
            state: state.state_name,
            value: state.total_verified,
            total_pensioners: state.total_pensioners,
            verified_pensioners: state.total_verified,
            pending_pensioners: state.total_pending,
            verification_rate: state.verification_percentage,
            national_share: state.share_of_national_verified,
            category: state.verification_category,
            rank: state.verification_rank,
            // Enhanced bank information
            banks_count: state.total_banks,
            districts_count: state.total_districts,
            pincodes_count: state.total_pincodes,
            bank_density_category: state.bank_density_category,
            bank_count_rank: state.bank_count_rank,
            share_of_national_banks: state.share_of_national_banks,
            // Geographic coverage metrics
            pensioners_per_bank: state.total_banks > 0 ? Math.round(state.total_pensioners / state.total_banks) : 0,
            verified_per_bank: state.total_banks > 0 ? Math.round(state.total_verified / state.total_banks) : 0,
            banks_per_district: state.total_districts > 0 ? Math.round(state.total_banks / state.total_districts) : 0,
            data_sources: state.data_sources.split(',')
        }));

        // Enhanced summary statistics
        const summary = {
            total_states: stateData.length,
            national_verified_pensioners: stateData.reduce((sum, state) => sum + state.total_verified, 0),
            national_total_banks: stateData.reduce((sum, state) => sum + state.total_banks, 0),
            national_total_districts: stateData.reduce((sum, state) => sum + state.total_districts, 0),
            national_total_pincodes: stateData.reduce((sum, state) => sum + state.total_pincodes, 0),
            top_state_by_verification: stateData[0] ? {
                name: stateData[0].state_name,
                verified: stateData[0].total_verified,
                percentage: stateData[0].verification_percentage,
                banks: stateData[0].total_banks
            } : null,
            top_state_by_banks: stateData.sort((a, b) => b.total_banks - a.total_banks)[0] ? {
                name: stateData.sort((a, b) => b.total_banks - a.total_banks)[0].state_name,
                banks: stateData.sort((a, b) => b.total_banks - a.total_banks)[0].total_banks,
                verified: stateData.sort((a, b) => b.total_banks - a.total_banks)[0].total_verified
            } : null,
            verification_categories: {
                'Very High': stateData.filter(s => s.verification_category === 'Very High').length,
                'High': stateData.filter(s => s.verification_category === 'High').length,
                'Medium': stateData.filter(s => s.verification_category === 'Medium').length,
                'Low': stateData.filter(s => s.verification_category === 'Low').length,
                'Very Low': stateData.filter(s => s.verification_category === 'Very Low').length
            },
            bank_density_categories: {
                'Very High Bank Density': stateData.filter(s => s.bank_density_category === 'Very High Bank Density').length,
                'High Bank Density': stateData.filter(s => s.bank_density_category === 'High Bank Density').length,
                'Medium Bank Density': stateData.filter(s => s.bank_density_category === 'Medium Bank Density').length,
                'Low Bank Density': stateData.filter(s => s.bank_density_category === 'Low Bank Density').length,
                'Very Low Bank Density': stateData.filter(s => s.bank_density_category === 'Very Low Bank Density').length
            }
        };

        res.json({
            success: true,
            message: "Enhanced choropleth data with advanced filtering and comprehensive bank analysis",
            filters_applied: {
                age_category: age_category || 'all',
                bank_name: bank_name || 'all',
                pension_type: pension_type || 'all',
                state_filter: state_filter || 'all',
                include_details: include_details === 'true'
            },
            choropleth_data: choroplethData,
            top_states_with_bank_details: topStatesWithBankDetails,
            summary: summary,
            national_bank_analysis: {
                total_unique_banks_analyzed: nationalSummary.total_banks_doppw || 0,
                total_states_with_bank_data: nationalSummary.total_states_doppw || 0,
                total_records_processed: nationalSummary.total_records_doppw || 0,
                overall_verification_rate: nationalSummary.total_records_doppw > 0 ?
                    parseFloat(((nationalSummary.total_verified_doppw / nationalSummary.total_records_doppw) * 100).toFixed(2)) : 0
            },
            data_sources: [
                'doppw_pensioner_data (main verification table with bank details)',
                'bank_pensioner_data (bank aggregated data)',
                'ubi1_pensioner_data (UBI1 individual records)',
                'ubi3_pensioner_data (UBI3 individual records)',
                'psa_pensioner_data (PSA state-wise data)'
            ],
            enhanced_features: [
                'Advanced filtering by age category (60-70, 70-80, 80+, <60)',
                'Bank-specific analysis (SBI, Canara, etc.)',
                'Pension type filtering (Defence, Railway, Civil, Postal)',
                'State-specific filtering capabilities',
                'Comprehensive bank count analysis across all tables',
                'Bank density categorization by state',
                'Geographic coverage metrics (districts, pincodes)',
                'Detailed bank breakdown with filtering',
                'Pensioners per bank ratios with filters',
                'National bank distribution analysis'
            ],
            filtering_options: {
                age_categories: ['all', '60-70', '70-80', '80+', '<60', '<80', 'unknown'],
                pension_types: ['all', 'Defence', 'Railway', 'Civil', 'Postal'],
                bank_examples: ['SBI', 'Canara', 'PNB', 'BOI', 'Union', 'all'],
                additional_params: ['state_filter', 'include_details=true']
            },
            api_usage_examples: {
                age_filtering: `/api/choropleth/state-verification-data?age_category=60-70`,
                bank_filtering: `/api/choropleth/state-verification-data?bank_name=SBI`,
                pension_type_filtering: `/api/choropleth/state-verification-data?pension_type=Defence`,
                combined_filtering: `/api/choropleth/state-verification-data?age_category=70-80&bank_name=SBI&pension_type=Railway`,
                state_specific: `/api/choropleth/state-verification-data?state_filter=Maharashtra&include_details=true`,
                defence_80plus: `/api/choropleth/state-verification-data?age_category=80+&pension_type=Defence&include_details=true`,
                sbi_railway_analysis: `/api/choropleth/state-verification-data?bank_name=SBI&pension_type=Railway&age_category=70-80`
            },
            map_visualization_guide: {
                verification_color_scale: {
                    'Very High': '≥100,000 verified pensioners',
                    'High': '50,000-99,999 verified pensioners',
                    'Medium': '20,000-49,999 verified pensioners',
                    'Low': '5,000-19,999 verified pensioners',
                    'Very Low': '<5,000 verified pensioners'
                },
                bank_density_color_scale: {
                    'Very High Bank Density': '≥1,000 banks',
                    'High Bank Density': '500-999 banks',
                    'Medium Bank Density': '100-499 banks',
                    'Low Bank Density': '50-99 banks',
                    'Very Low Bank Density': '<50 banks'
                },
                recommended_colors: {
                    verification: {
                        'Very High': '#006837',
                        'High': '#31a354',
                        'Medium': '#78c679',
                        'Low': '#c2e699',
                        'Very Low': '#f7fcf5'
                    },
                    bank_density: {
                        'Very High Bank Density': '#08519c',
                        'High Bank Density': '#3182bd',
                        'Medium Bank Density': '#6baed6',
                        'Low Bank Density': '#bdd7e7',
                        'Very Low Bank Density': '#eff3ff'
                    }
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in enhanced choropleth data API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch enhanced choropleth data',
            details: error.message
        });
    } finally {
        closeDb();
    }
});




// Enhanced State-wise Bank Verification Summary with Pincode Data and Filtering
app.get('/api/choropleth/state-bank-summary/:stateName', async (req, res) => {
    const { stateName } = req.params;
    const { bank_name, district, pincode, limit = 100, offset = 0 } = req.query;
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Build dynamic WHERE clause for filtering
        let filterConditions = [`UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))`];
        let queryParams = [stateName];

        if (bank_name) {
            filterConditions.push(`UPPER(TRIM(branch_name)) LIKE UPPER(TRIM(?))`);
            queryParams.push(`%${bank_name}%`);
        }

        if (district) {
            filterConditions.push(`UPPER(TRIM(pensioner_district)) LIKE UPPER(TRIM(?))`);
            queryParams.push(`%${district}%`);
        }

        if (pincode) {
            filterConditions.push(`pensioner_pincode = ?`);
            queryParams.push(pincode);
        }

        const whereClause = filterConditions.join(' AND ');

        // Get comprehensive bank-wise data with pincode details
        const detailedQuery = `
            WITH bank_pincode_data AS (
                SELECT 
                    branch_name as bank_name,
                    pensioner_district as district,
                    pensioner_pincode as pincode,
                    COUNT(*) as total_pensioners,
                    COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                    COUNT(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 END) as pending_pensioners,
                    'doppw_pensioner_data' as source
                FROM doppw_pensioner_data
                WHERE ${whereClause}
                    AND branch_name IS NOT NULL AND branch_name != ''
                    AND pensioner_district IS NOT NULL AND pensioner_district != ''
                    AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
                GROUP BY branch_name, pensioner_district, pensioner_pincode
                
                UNION ALL
                
                SELECT 
                    bank_name,
                    bank_city as district,
                    branch_pin_code as pincode,
                    SUM(COALESCE(grand_total, 0)) as total_pensioners,
                    SUM(COALESCE(grand_total, 0)) as verified_pensioners,
                    0 as pending_pensioners,
                    'bank_pensioner_data' as source
                FROM bank_pensioner_data
                WHERE UPPER(TRIM(bank_state)) = UPPER(TRIM(?))
                    ${bank_name ? 'AND UPPER(TRIM(bank_name)) LIKE UPPER(TRIM(?))' : ''}
                    ${district ? 'AND UPPER(TRIM(bank_city)) LIKE UPPER(TRIM(?))' : ''}
                    ${pincode ? 'AND branch_pin_code = ?' : ''}
                    AND bank_name IS NOT NULL AND bank_name != ''
                    AND bank_city IS NOT NULL AND bank_city != ''
                    AND branch_pin_code IS NOT NULL AND branch_pin_code != ''
                GROUP BY bank_name, bank_city, branch_pin_code
            )
            SELECT 
                bank_name,
                district,
                pincode,
                SUM(total_pensioners) as total_pensioners,
                SUM(verified_pensioners) as verified_pensioners,
                SUM(pending_pensioners) as pending_pensioners,
                ROUND((SUM(verified_pensioners) * 100.0 / NULLIF(SUM(total_pensioners), 0)), 2) as verification_rate,
                GROUP_CONCAT(DISTINCT source) as data_sources
            FROM bank_pincode_data
            GROUP BY bank_name, district, pincode
            ORDER BY verified_pensioners DESC, bank_name, district, pincode
            LIMIT ? OFFSET ?
        `;

        // Add additional parameters for bank_pensioner_data filtering
        let detailedParams = [...queryParams, stateName];
        if (bank_name) detailedParams.push(`%${bank_name}%`);
        if (district) detailedParams.push(`%${district}%`);
        if (pincode) detailedParams.push(pincode);
        detailedParams.push(parseInt(limit), parseInt(offset));

        const detailedData = await new Promise((resolve, reject) => {
            db.all(detailedQuery, detailedParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get summary statistics for the state
        const summaryQuery = `
            WITH state_summary AS (
                SELECT 
                    branch_name as bank_name,
                    COUNT(*) as total_pensioners,
                    COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                    COUNT(DISTINCT pensioner_district) as districts_served,
                    COUNT(DISTINCT pensioner_pincode) as pincodes_served
                FROM doppw_pensioner_data
                WHERE ${whereClause}
                    AND branch_name IS NOT NULL AND branch_name != ''
                GROUP BY branch_name
                
                UNION ALL
                
                SELECT 
                    bank_name,
                    SUM(COALESCE(grand_total, 0)) as total_pensioners,
                    SUM(COALESCE(grand_total, 0)) as verified_pensioners,
                    COUNT(DISTINCT bank_city) as districts_served,
                    COUNT(DISTINCT branch_pin_code) as pincodes_served
                FROM bank_pensioner_data
                WHERE UPPER(TRIM(bank_state)) = UPPER(TRIM(?))
                    ${bank_name ? 'AND UPPER(TRIM(bank_name)) LIKE UPPER(TRIM(?))' : ''}
                    ${district ? 'AND UPPER(TRIM(bank_city)) LIKE UPPER(TRIM(?))' : ''}
                    ${pincode ? 'AND branch_pin_code = ?' : ''}
                    AND bank_name IS NOT NULL AND bank_name != ''
                GROUP BY bank_name
            )
            SELECT 
                bank_name,
                SUM(total_pensioners) as total_pensioners,
                SUM(verified_pensioners) as verified_pensioners,
                MAX(districts_served) as districts_served,
                MAX(pincodes_served) as pincodes_served,
                ROUND((SUM(verified_pensioners) * 100.0 / NULLIF(SUM(total_pensioners), 0)), 2) as verification_rate
            FROM state_summary
            GROUP BY bank_name
            ORDER BY verified_pensioners DESC
        `;

        let summaryParams = [...queryParams, stateName];
        if (bank_name) summaryParams.push(`%${bank_name}%`);
        if (district) summaryParams.push(`%${district}%`);
        if (pincode) summaryParams.push(pincode);

        const bankSummary = await new Promise((resolve, reject) => {
            db.all(summaryQuery, summaryParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get total count for pagination
        const countQuery = `
            WITH bank_pincode_count AS (
                SELECT COUNT(DISTINCT branch_name || '|' || pensioner_district || '|' || pensioner_pincode) as count
                FROM doppw_pensioner_data
                WHERE ${whereClause}
                    AND branch_name IS NOT NULL AND branch_name != ''
                    AND pensioner_district IS NOT NULL AND pensioner_district != ''
                    AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
                
                UNION ALL
                
                SELECT COUNT(DISTINCT bank_name || '|' || bank_city || '|' || branch_pin_code) as count
                FROM bank_pensioner_data
                WHERE UPPER(TRIM(bank_state)) = UPPER(TRIM(?))
                    ${bank_name ? 'AND UPPER(TRIM(bank_name)) LIKE UPPER(TRIM(?))' : ''}
                    ${district ? 'AND UPPER(TRIM(bank_city)) LIKE UPPER(TRIM(?))' : ''}
                    ${pincode ? 'AND branch_pin_code = ?' : ''}
                    AND bank_name IS NOT NULL AND bank_name != ''
                    AND bank_city IS NOT NULL AND bank_city != ''
                    AND branch_pin_code IS NOT NULL AND branch_pin_code != ''
            )
            SELECT SUM(count) as total_records FROM bank_pincode_count
        `;

        let countParams = [...queryParams, stateName];
        if (bank_name) countParams.push(`%${bank_name}%`);
        if (district) countParams.push(`%${district}%`);
        if (pincode) countParams.push(pincode);

        const totalCount = await new Promise((resolve, reject) => {
            db.get(countQuery, countParams, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row?.total_records || 0);
                }
            });
        });

        const totalVerified = bankSummary.reduce((sum, bank) => sum + bank.verified_pensioners, 0);
        const totalPensioners = bankSummary.reduce((sum, bank) => sum + bank.total_pensioners, 0);
        const totalDistricts = bankSummary.reduce((sum, bank) => sum + bank.districts_served, 0);
        const totalPincodes = bankSummary.reduce((sum, bank) => sum + bank.pincodes_served, 0);

        res.json({
            success: true,
            state: stateName.toUpperCase(),
            filters_applied: {
                bank_name: bank_name || null,
                district: district || null,
                pincode: pincode || null
            },
            detailed_data: detailedData,
            bank_summary: bankSummary,
            pagination: {
                total_records: totalCount,
                current_page: Math.floor(offset / limit) + 1,
                total_pages: Math.ceil(totalCount / limit),
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_next: (parseInt(offset) + parseInt(limit)) < totalCount,
                has_previous: parseInt(offset) > 0
            },
            summary: {
                total_banks: bankSummary.length,
                total_pensioners: totalPensioners,
                total_verified: totalVerified,
                total_districts: totalDistricts,
                total_pincodes: totalPincodes,
                overall_verification_rate: totalPensioners > 0 ?
                    parseFloat(((totalVerified / totalPensioners) * 100).toFixed(2)) : 0,
                top_bank: bankSummary[0] ? {
                    name: bankSummary[0].bank_name,
                    verified: bankSummary[0].verified_pensioners,
                    districts: bankSummary[0].districts_served,
                    pincodes: bankSummary[0].pincodes_served
                } : null
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in state bank summary API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch state bank summary',
            details: error.message
        });
    } finally {
        closeDb();
    }
});



// Quick Pincode Summary API - Just pincode and pensioner count
app.get('/api/geography/pincode-summary/:stateName', async (req, res) => {
    const { stateName } = req.params;
    const { limit = 1000 } = req.query;

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Simplified query for quick pincode data
        const query = `
            WITH pincode_totals AS (
                SELECT 
                    pensioner_pincode as pincode,
                    COUNT(*) as pensioners
                FROM doppw_pensioner_data
                WHERE UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))
                    AND pensioner_pincode IS NOT NULL 
                    AND pensioner_pincode != 'nan' 
                    AND pensioner_pincode != ''
                GROUP BY pensioner_pincode
                
                UNION ALL
                
                SELECT 
                    branch_pin_code as pincode,
                    SUM(COALESCE(grand_total, 0)) as pensioners
                FROM bank_pensioner_data
                WHERE UPPER(TRIM(bank_state)) = UPPER(TRIM(?))
                    AND branch_pin_code IS NOT NULL 
                    AND branch_pin_code != 'nan' 
                    AND branch_pin_code != ''
                GROUP BY branch_pin_code
            )
            SELECT 
                pincode,
                SUM(pensioners) as totalPensioners
            FROM pincode_totals
            GROUP BY pincode
            ORDER BY totalPensioners DESC
            LIMIT ?
        `;

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [stateName, stateName, parseInt(limit)], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Format for simple pincode visualization
        const pincodeData = {};
        rows.forEach(row => {
            pincodeData[row.pincode] = row.totalPensioners;
        });

        res.json({
            success: true,
            state: stateName.toUpperCase(),
            pincode_data: pincodeData,
            total_pincodes: rows.length,
            max_pensioners: Math.max(...rows.map(r => r.totalPensioners)),
            min_pensioners: Math.min(...rows.map(r => r.totalPensioners)),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in pincode summary API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pincode summary',
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
    generateDynamicKey,
    encryptPayload,
    decryptPayload,
    encryptAESKeyWithRSAPublicKey,
    decryptAESKeyWithRSAPrivateKey,
    createDigitalSignature,
    verifyDigitalSignature,
    processIncomingRequest,
    prepareOutgoingRequest,
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

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

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
const { cache } = require('react');
const { isNullOrUndefined } = require('util');
const constants = require('constants');
app.use('/api/pincode', pincodeApiRouter);

const _addLimitClauseIfNeeded = (query, limit) => {
    query = query.trim();
    if (limit && !query.toLowerCase().includes('limit')) {
        query += ` LIMIT ` + limit;
    }
    return query;
};

// Helper: Get top pensioner types
async function getTopPSA(limit) {
    let query = `
            select pensioner_type as psa,
                    count(*) as all_pensioner_count, 
                    COUNT(LC_date) AS verified_pensioner_count,
                    ROUND(
                                    COUNT(LC_date) * 100.0 / COUNT(*),
                                    2
                                ) AS completion_ratio
                    from all_pensioners group by pensioner_type
                    order by completion_ratio desc, all_pensioner_count desc`;

    query = _addLimitClauseIfNeeded(query, limit);
    return new Promise((resolve, reject) => {

        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        db.all(query, (err, rows) => {
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
async function getTopCentralPensionerSubtypeCounts(limit) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

        let query = `
                    SELECT
                        pensioner_subtype,COUNT(*) AS all_pensioner_count,
                        COUNT(LC_date) AS verified_pensioner_count,
                        (COUNT(LC_date) * 100.0 / COUNT(*)) AS completion_ratio
                    FROM
                        all_pensioners
                    WHERE
                        pensioner_type = 'CENTRAL'
                    GROUP BY
                        pensioner_subtype
                    ORDER BY
                        completion_ratio DESC, all_pensioner_count DESC;
                    `;

        query = _addLimitClauseIfNeeded(query, limit);
        db.all(query, [], (err, rows) => {
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
        const topPSA = await getTopPSA(limit);


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
        const data = await getTopCentralPensionerSubtypeCounts(limit);
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
