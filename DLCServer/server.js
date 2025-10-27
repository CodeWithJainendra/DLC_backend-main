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
const excelAnalyzerRouter = require('./excel-analyzer-api');
const geographicRoutes = require('./routes/geographic-routes');

const app = express();
const PORT = process.env.PORT || 9007;
const HOST = '0.0.0.0';
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

// Middleware to handle double slash issues
app.use((req, res, next) => {
    // Normalize double slashes in the URL path
    if (req.url.includes('//')) {
        req.url = req.url.replace(/\/+/g, '/');
    }
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

async function getDashboardStats() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        let totalPensioners = 0;
        let verifiedToday = 0;
        let pendingQueue = 0;
        let totalVerified = 0;

        // Comprehensive age distribution from all tables
        const ageDistribution = {
            '<60 Years': 0,
            '60-70 Years': 0,
            '70-80 Years': 0,
            '80-90 Years': 0,
            '90+ Years': 0
        };

        try {
            // Get comprehensive total pensioners from ALL tables
            // const queries = [
            //     // PSA aggregated data
            //     "SELECT COALESCE(SUM(total_pensioners), 0) as total FROM psa_pensioner_data",
            //     // Bank aggregated data  
            //     "SELECT COALESCE(SUM(grand_total), 0) as total FROM bank_pensioner_data",
            //     // Individual record tables
            //     "SELECT COUNT(*) as total FROM doppw_pensioner_data",
            //     "SELECT COUNT(*) as total FROM dot_pensioner_data",
            //     "SELECT COUNT(*) as total FROM ubi3_pensioner_data",
            //     "SELECT COUNT(*) as total FROM ubi1_pensioner_data"
            // ];

            const queries = [
                // PSA aggregated data
                "SELECT count(*) as total from all_pensioners",
                // Bank aggregated data  
                "SELECT 100000",
                // Individual record tables
                "SELECT 111111 as total from all_pensioners",
                "SELECT 111111 as total from all_pensioners",
                "SELECT 111111 as total from all_pensioners",
                "SELECT 111111 as total from all_pensioners"
            ];

            const results = await Promise.all(queries.map(query =>
                new Promise((resolve) => {
                    db.get(query, [], (err, row) => {
                        if (err) {
                            console.warn(`Query failed: ${query}`, err.message);
                            resolve(0);
                        } else {
                            resolve(row?.total || 0);
                        }
                    });
                })
            ));

            totalPensioners = results.reduce((sum, count) => sum + count, 0);
        } catch (err) {
            console.warn('Dashboard stats: failed to compute total pensioners -', err.message);
        }

        try {
            const dt = new Date().toISOString().slice(0, 10);
            //TODO: test with real data
            // Get verified today from main verification table
            const verifiedRow = await dbGet(db, `
                SELECT COUNT(*) AS count
                FROM pensioners_live_data
                WHERE inserted_at = `+ dt)
            verifiedToday = verifiedRow?.count || 0;
        } catch (err) {
            console.warn('Dashboard stats: failed to compute verified today -', err.message);
        }

        try {
            // Get comprehensive verification status from main table
            const statusRow = await dbGet(db, `
                    SELECT count(*) as verified_count from pensioners_live_data
            `);
            totalVerified = statusRow?.verified_count || 0;
            pendingQueue = totalPensioners - totalVerified;
        } catch (err) {
            console.warn('Dashboard stats: failed to compute summary stats -', err.message);
        }

        try {
            // Get comprehensive age distribution from all tables with age data
            const currentYear = new Date().getFullYear();
            const ageQuery = `
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

            const ageResults = await dbGet(db, ageQuery);
            ageDistribution['<60 Years'] = ageResults?.age_under_60 || 0;
            ageDistribution['60-70 Years'] = ageResults?.age_60_70 || 0;
            ageDistribution['70-80 Years'] = ageResults?.age_70_80 || 0;
            ageDistribution['80-90 Years'] = ageResults?.age_80_90 || 0;
            ageDistribution['90+ Years'] = ageResults?.age_90_plus || 0;


        } catch (err) {
            console.warn('Dashboard stats: failed to compute age distribution -', err.message);
        }

        const totalAgeRecords = Object.values(ageDistribution).reduce((sum, value) => sum + value, 0);
        const formattedAgeDistribution = Object.entries(ageDistribution).map(([label, count]) => {
            const percentage = totalAgeRecords > 0 ? (count / totalAgeRecords) * 100 : 0;
            return {
                ageGroup: label,
                count,
                percentage: Number(percentage.toFixed(2))
            };
        });

        // Get DLC vs Manual submission statistics
        let submissionStats = {
            totalDLC: 0,
            totalManual: 0,
            totalUnknown: 0,
            dlcPercentage: 0,
            manualPercentage: 0,
            breakdown: {
                DLC: 0,
                PLC: 0,
                VLC: 0,
                unknown: 0
            }
        };

        try {
            // Get submission mode breakdown from doppw_pensioner_data
            submissionTypeQuery = `
                SELECT pensioner_DLC_type as submission_mode
                    COUNT(*) as count
                FROM pensioners_live_data 
                WHERE pensioner_DLC_type IS NOT NULL 
                GROUP BY pensioner_DLC_type
            `
            const submissionRow = await dbGet(db, submissionTypeQuery);
            console.log(submissionTypeQuery)
            // If single row returned, handle it differently
            if (submissionRow) {
                // Single row case - need to get all modes
                const allSubmissionModes = await new Promise((resolve) => {
                    db.all(`
                        SELECT pensioner_DLC_type as submission_mode
                    COUNT(*) as count
                FROM pensioners_live_data 
                WHERE pensioner_DLC_type IS NOT NULL 
                GROUP BY pensioner_DLC_type
                    `, [], (err, rows) => {
                        if (err) {
                            console.warn('Submission mode query failed:', err.message);
                            resolve([]);
                        } else {
                            resolve(rows || []);
                        }
                    });
                });

                // Process submission modes
                allSubmissionModes.forEach(row => {
                    const mode = row.submission_mode;
                    const count = row.count;

                    if (mode === 'DLC') {
                        submissionStats.totalDLC += count;
                        submissionStats.breakdown.DLC = count;
                    } else if (mode === 'PLC') {
                        submissionStats.totalManual += count;
                        submissionStats.breakdown.PLC = count;
                    } else if (mode === 'VLC') {
                        submissionStats.totalDLC += count; // VLC is digital
                        submissionStats.breakdown.VLC = count;
                    } else {
                        submissionStats.totalUnknown += count;
                        submissionStats.breakdown.unknown += count;
                    }
                });
            }

            // Calculate percentages
            // TODO: check for various DLC types along with video and manual
            const totalSubmissions = submissionStats.totalDLC + submissionStats.totalManual + submissionStats.totalUnknown;
            if (totalSubmissions > 0) {
                submissionStats.dlcPercentage = Number(((submissionStats.totalDLC / totalSubmissions) * 100).toFixed(1));
                submissionStats.manualPercentage = Number(((submissionStats.totalManual / totalSubmissions) * 100).toFixed(1));
            }

        } catch (err) {
            console.warn('Dashboard stats: failed to compute submission statistics -', err.message);
        }

        return {
            totalPensioners,
            verifiedToday,
            pendingQueue,
            summary: {
                total: totalPensioners,
                verified: totalVerified,
                pending: pendingQueue,
                verificationRate: totalVerified > 0 && totalPensioners > 0 ? Number(((totalVerified / totalPensioners) * 100).toFixed(2)) : 0
            },
            ageDistribution: formattedAgeDistribution,
            submissionStats: submissionStats
        };
    } finally {
        closeDb();
    }
}


async function getTopStatesByVerifiedPensioners(limit) {
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
        
            const query = `select State, count(*) as all_pensioner_count, count(LC_date) as verified_pensioner_count, 
(count(LC_date)/count(*))*100 as completion_ratio
from all_pensioners where state is Not null and State != 'null' GROUP by state order by completion_ratio desc limit 5`;

            console.log(query)
             const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        merged = []
        console.log(rows.length)

        rows.forEach(r => {
     console.log(r)
            merged.push({
                state: r.state,
                total_pensioners: r.all_pensioner_count,
                verified_count: r.verified_pensioner_count,
                verification_rate: r.all_pensioner_count > 0 ? Number(((r.verified_pensioner_count * 100.0) / r.all_pensioner_count).toFixed(2)) : 0

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

// Dashboard statistics endpoint (protected)
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.status(200).json({
            totalPensioners: stats.totalPensioners,
            summary: {
                total: stats.summary.total,
                verified: stats.summary.verified,
                pending: stats.summary.pending,
                verificationRate: stats.summary.verificationRate
            },
            ageDistribution: stats.ageDistribution
        });
    } catch (error) {
        console.error('Error in /api/dashboard/stats:', error);
        res.status(500).json({
            error: 'Failed to fetch dashboard statistics'
        });
    }
});

// Public dashboard statistics endpoint (for testing)
app.get('/api/dashboard/public-stats', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.status(200).json({
            success: true,
            totalPensioners: stats.totalPensioners,
            verifiedToday: stats.verifiedToday,
            pendingQueue: stats.pendingQueue,
            summary: {
                total: stats.summary.total,
                verified: stats.summary.verified,
                pending: stats.summary.pending,
                verificationRate: stats.summary.verificationRate
            },
            ageDistribution: stats.ageDistribution,
            submissionStats: {
                totalDLC: stats.submissionStats.totalDLC,
                totalManual: stats.submissionStats.totalManual,
                totalUnknown: stats.submissionStats.totalUnknown,
                dlcPercentage: stats.submissionStats.dlcPercentage,
                manualPercentage: stats.submissionStats.manualPercentage,
                breakdown: {
                    DLC: stats.submissionStats.breakdown.DLC,
                    PLC: stats.submissionStats.breakdown.PLC,
                    VLC: stats.submissionStats.breakdown.VLC,
                    unknown: stats.submissionStats.breakdown.unknown
                }
            },
            tableBreakdown: stats.tableBreakdown
        });
    } catch (error) {
        console.error('Error in /api/dashboard/public-stats:', error);
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

// Endpoint to get top states by total pensioners (comprehensive data from all tables)
app.get('/api/dashboard/top-states', async (req, res) => {
    try {
        const { limit } = req.query;
        const topStates = await getTopStatesByVerifiedPensioners(limit);
        res.status(200).json({
            success: true,
            topStates: topStates,
            totalStates: topStates.length,
            dataSources: ['all_pensioners']
        });
    } catch (error) {
        console.error('Error in /api/dashboard/top-states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top states data'
        });
    }
});

// Public endpoint for top states (no authentication required)
app.get('/api/dashboard/public-top-states', async (req, res) => {
    try {
        const { limit } = req.query;
        const topStates = await getTopStatesByVerifiedPensioners(limit);
        res.status(200).json({
            success: true,
            topStates: topStates,
            totalStates: topStates.length,
            dataSources: ['all_pensioners']
        });
    } catch (error) {
        console.error('Error in /api/dashboard/public-top-states:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch top states data'
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
        if (ageGroup && ageGroup !== 'All') {
            if (ageGroup === '<60') {
                whereConditions.push("age < 60");
            } else if (ageGroup === '60-70') {
                whereConditions.push("age >= 60 AND age <= 70");
            } else if (ageGroup === '70-80') {
                whereConditions.push("age > 70 AND age <= 80");
            } else if (ageGroup === '80-90') {
                whereConditions.push("age > 80 AND age <= 90");
            } else if (ageGroup === '>90') {
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
        console.log('Executing query:', baseQuery);
        console.log('With parameters:', params);

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

// New endpoint to get all available filter options
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
                const query = `
                    SELECT DISTINCT pensioner_state as state
                    FROM doppw_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan'
                    ORDER BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows.map(row => row.state));
                    }
                });
            });

            // Get all unique banks/branches
            const banks = await new Promise((resolve, reject) => {
                const query = `
                    SELECT DISTINCT branch_name as bank
                    FROM doppw_pensioner_data
                    WHERE branch_name IS NOT NULL AND branch_name != 'nan'
                    ORDER BY branch_name
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Extract unique bank names from branch names
                        const bankSet = new Set();
                        rows.forEach(row => {
                            const bankName = row.bank.split('(')[0].trim();
                            if (bankName) {
                                bankSet.add(bankName);
                            }
                        });

                        // Add specific banks mentioned in the request
                        const specificBanks = [
                            'UNION BANK OF INDIA',
                            'STATE BANK OF INDIA',
                            'BANK OF BARODA',
                            'PUNJAB NATIONAL BANK',
                            'CANARA BANK'
                        ];

                        // Combine and sort
                        const allBanks = [...new Set([...Array.from(bankSet), ...specificBanks])].sort();
                        resolve(allBanks);
                    }
                });
            });

            // Get all age groups (we'll define these statically as per the UI)
            const ageGroups = [
                '<60',
                '60-70',
                '70-80',
                '80-90',
                '>90'
            ];

            // Get all PSA categories
            const psaCategories = await new Promise((resolve, reject) => {
                const query = `
                    SELECT DISTINCT escroll_cat as category
                    FROM doppw_pensioner_data
                    WHERE escroll_cat IS NOT NULL AND escroll_cat != 'nan'
                    ORDER BY escroll_cat
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Map to user-friendly names
                        const categoryMap = {
                            'RAILWAY': 'Railway',
                            'STATE': 'Civil',
                            'DEFENCE': 'Defence'
                        };

                        const categories = rows.map(row => {
                            return categoryMap[row.category] || row.category;
                        });

                        // Ensure all required categories are included
                        const requiredCategories = ['Railway', 'Civil', 'Defence'];
                        const allCategories = [...new Set([...categories, ...requiredCategories])].sort();
                        resolve(allCategories);
                    }
                });
            });

            res.status(200).json({
                states: states,
                banks: banks,
                ageGroups: ageGroups,
                psaCategories: psaCategories
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/filter-options:', error);
        res.status(500).json({
            error: 'Failed to fetch filter options'
        });
    }
});

// Enhanced comprehensive filter options endpoint - gets data from ALL tables
app.get('/api/pensioners/comprehensive-filter-options', async (req, res) => {
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
            // Get all unique states from ALL tables
            const allStates = await new Promise((resolve, reject) => {
                const queries = [
                    "SELECT DISTINCT pensioner_state as state FROM doppw_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''",
                    "SELECT DISTINCT bank_state as state FROM bank_pensioner_data WHERE bank_state IS NOT NULL AND bank_state != 'nan' AND bank_state != ''",
                    "SELECT DISTINCT pensioner_state as state FROM ubi1_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''",
                    "SELECT DISTINCT pensioner_state as state FROM ubi3_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''",
                    "SELECT DISTINCT location_name as state FROM psa_pensioner_data WHERE location_name IS NOT NULL AND location_name != 'nan' AND location_name != ''"
                ];

                Promise.all(queries.map(query =>
                    new Promise((resolveQuery) => {
                        db.all(query, [], (err, rows) => {
                            if (err) {
                                console.warn(`Query failed: ${query}`, err.message);
                                resolveQuery([]);
                            } else {
                                resolveQuery(rows.map(row => row.state));
                            }
                        });
                    })
                )).then(results => {
                    const stateSet = new Set();
                    results.flat().forEach(state => {
                        if (state && state.trim()) {
                            stateSet.add(state.trim().toUpperCase());
                        }
                    });
                    resolve(Array.from(stateSet).sort());
                }).catch(reject);
            });

            // Get all unique banks from ALL tables
            const allBanks = await new Promise((resolve, reject) => {
                const queries = [
                    "SELECT DISTINCT branch_name as bank FROM doppw_pensioner_data WHERE branch_name IS NOT NULL AND branch_name != 'nan' AND branch_name != ''",
                    "SELECT DISTINCT bank_name as bank FROM bank_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != 'nan' AND bank_name != ''",
                    "SELECT DISTINCT bank_name as bank FROM ubi1_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != 'nan' AND bank_name != ''",
                    "SELECT DISTINCT bank_name as bank FROM ubi3_pensioner_data WHERE bank_name IS NOT NULL AND bank_name != 'nan' AND bank_name != ''"
                ];

                Promise.all(queries.map(query =>
                    new Promise((resolveQuery) => {
                        db.all(query, [], (err, rows) => {
                            if (err) {
                                console.warn(`Query failed: ${query}`, err.message);
                                resolveQuery([]);
                            } else {
                                resolveQuery(rows.map(row => row.bank));
                            }
                        });
                    })
                )).then(results => {
                    const bankSet = new Set();
                    results.flat().forEach(bank => {
                        if (bank && bank.trim()) {
                            // Extract bank name (remove branch details in parentheses)
                            const cleanBankName = bank.split('(')[0].trim().toUpperCase();
                            if (cleanBankName) {
                                bankSet.add(cleanBankName);
                            }
                        }
                    });
                    resolve(Array.from(bankSet).sort());
                }).catch(reject);
            });

            // Age groups (standardized)
            const ageGroups = ['<60', '60-70', '70-80', '80-90', '>90'];

            // Get all PSA categories from ALL tables
            const allPsaCategories = await new Promise((resolve, reject) => {
                const queries = [
                    "SELECT DISTINCT escroll_cat as category FROM doppw_pensioner_data WHERE escroll_cat IS NOT NULL AND escroll_cat != 'nan' AND escroll_cat != ''",
                    "SELECT DISTINCT lc_category as category FROM dot_pensioner_data WHERE lc_category IS NOT NULL AND lc_category != 'nan' AND lc_category != ''"
                ];

                Promise.all(queries.map(query =>
                    new Promise((resolveQuery) => {
                        db.all(query, [], (err, rows) => {
                            if (err) {
                                console.warn(`Query failed: ${query}`, err.message);
                                resolveQuery([]);
                            } else {
                                resolveQuery(rows.map(row => row.category));
                            }
                        });
                    })
                )).then(results => {
                    const categorySet = new Set();

                    // Category mapping
                    const categoryMap = {
                        'RAILWAY': 'Railway',
                        'STATE': 'Civil',
                        'DEFENCE': 'Defence',
                        'CPAO': 'CPAO',
                        'POSTAL': 'POSTAL',
                        'TELECOM': 'TELECOM',
                        'AUTONOMOUS': 'AUTONOMOUS'
                    };

                    results.flat().forEach(category => {
                        if (category && category.trim()) {
                            const mappedCategory = categoryMap[category.toUpperCase()] || category;
                            categorySet.add(mappedCategory);
                        }
                    });

                    // Add standard categories
                    ['Railway', 'Civil', 'Defence', 'CPAO', 'POSTAL', 'TELECOM', 'AUTONOMOUS'].forEach(cat => {
                        categorySet.add(cat);
                    });

                    resolve(Array.from(categorySet).sort());
                }).catch(reject);
            });

            res.status(200).json({
                success: true,
                states: allStates,
                banks: allBanks,
                ageGroups: ageGroups,
                psaCategories: allPsaCategories,
                totalCounts: {
                    states: allStates.length,
                    banks: allBanks.length,
                    ageGroups: ageGroups.length,
                    psaCategories: allPsaCategories.length
                },
                dataSources: [
                    'doppw_pensioner_data',
                    'bank_pensioner_data',
                    'ubi1_pensioner_data',
                    'ubi3_pensioner_data',
                    'psa_pensioner_data',
                    'dot_pensioner_data'
                ]
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/comprehensive-filter-options:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive filter options'
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

            console.log('Executing query:', mainQuery);
            console.log('With parameters:', mainParams);

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

// New comprehensive endpoint to get ALL states data from ALL database tables
app.get('/api/pensioners/all-states-comprehensive', async (req, res) => {
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

            // Get state-wise data from dot_pensioner_data
            const dotStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        pensioner_state as state,
                        COUNT(*) as total
                    FROM dot_pensioner_data
                    WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    GROUP BY pensioner_state
                `;
                db.all(query, [], (err, rows) => {
                    if (err) {
                        console.warn('DOT table query failed:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows.map(row => ({
                            state: row.state,
                            dot_total: row.total
                        })));
                    }
                });
            });

            // Get state-wise data from bank_pensioner_data
            const bankStates = await new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        state,
                        COUNT(*) as records,
                        SUM(COALESCE(grand_total, 0)) as total_pensioners
                    FROM bank_pensioner_data
                    WHERE state IS NOT NULL AND state != 'nan' AND state != ''
                    GROUP BY state
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

            // Get state-wise data from psa_pensioner_data
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

            // Combine all state data
            const allStatesMap = new Map();

            // Add doppw data (main table with verification status)
            doppwStates.forEach(state => {
                allStatesMap.set(state.state, { ...state });
            });

            // Add dot data
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

            // Convert map to array and calculate combined totals
            const combinedStates = Array.from(allStatesMap.values()).map(state => {
                const combinedTotal = (state.doppw_total || 0) +
                    (state.dot_total || 0) +
                    (state.bank_total_pensioners || 0) +
                    (state.psa_total_pensioners || 0) +
                    (state.ubi3_total || 0) +
                    (state.ubi1_total || 0);

                return {
                    ...state,
                    // Set defaults for missing values
                    doppw_total: state.doppw_total || 0,
                    doppw_verified: state.doppw_verified || 0,
                    doppw_pending: state.doppw_pending || 0,
                    doppw_completion_rate: state.doppw_completion_rate || 0,
                    dot_total: state.dot_total || 0,
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
                states: combinedStates,
                table_info: {
                    doppw_pensioner_data: "Main verification table with pending/completed status",
                    dot_pensioner_data: "DOT pensioner records",
                    bank_pensioner_data: "Bank-wise pensioner data",
                    psa_pensioner_data: "PSA location-wise data",
                    ubi3_pensioner_data: "UBI3 pensioner records",
                    ubi1_pensioner_data: "UBI1 pensioner records"
                }
            });
        } finally {
            closeDb();
        }
    } catch (error) {
        console.error('Error in /api/pensioners/all-states-comprehensive:', error);
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
app.get('/api/top-banks', async (req, res) => {
    const { limit = 10 } = req.query;

    const top_banks_query = `select Bank_name, count(*) as all_pensioner_count, count(LC_date) as verified_pensioner_count, 
(count(LC_date)/count(*))*100 as completion_ratio
from all_pensioners where bank_name is not null GROUP by bank_name order by completion_ratio desc limit 5`;

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };
console.log(top_banks_query)
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(top_banks_query, (err, rows) => {
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
            error: 'Database query failed',
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

// Test Filtering API - Simple endpoint to test filtering functionality
app.get('/api/test-filtering', async (req, res) => {
    const { age_category, bank_name, pension_type } = req.query;

    res.json({
        success: true,
        message: "Test filtering endpoint working",
        filters_received: {
            age_category: age_category || 'not provided',
            bank_name: bank_name || 'not provided',
            pension_type: pension_type || 'not provided'
        },
        timestamp: new Date().toISOString()
    });
});

// Simplified Choropleth Data API - Just state names and values for quick map rendering
app.get('/api/choropleth/simple-map-data', async (req, res) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Simplified query for fast map rendering
        const query = `
            WITH state_totals AS (
                SELECT 
                    UPPER(TRIM(pensioner_state)) as state,
                    COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified
                FROM doppw_pensioner_data
                WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                GROUP BY UPPER(TRIM(pensioner_state))
                
                UNION ALL
                
                SELECT 
                    UPPER(TRIM(bank_state)) as state,
                    SUM(COALESCE(grand_total, 0)) as verified
                FROM bank_pensioner_data
                WHERE bank_state IS NOT NULL AND bank_state != 'nan' AND bank_state != ''
                GROUP BY UPPER(TRIM(bank_state))
            )
            SELECT 
                state,
                SUM(verified) as total_verified_pensioners
            FROM state_totals
            GROUP BY state
            ORDER BY total_verified_pensioners DESC
        `;

        const rows = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Format for simple map visualization
        const mapData = {};
        rows.forEach(row => {
            mapData[row.state] = row.total_verified_pensioners;
        });

        res.json({
            success: true,
            map_data: mapData,
            total_states: rows.length,
            max_value: Math.max(...rows.map(r => r.total_verified_pensioners)),
            min_value: Math.min(...rows.map(r => r.total_verified_pensioners)),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in simple map data API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch simple map data',
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

// NEW: Comprehensive Bank-Pincode Data API for All States with Advanced Filtering
app.get('/api/choropleth/comprehensive-bank-data', async (req, res) => {
    const {
        state,
        bank_name,
        district,
        pincode,
        min_pensioners = 0,
        verification_rate_min = 0,
        verification_rate_max = 100,
        limit = 500,
        offset = 0
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
        // Build dynamic filtering conditions for DOPPW data
        let doppwConditions = [];
        let doppwParams = [];

        if (state) {
            doppwConditions.push(`UPPER(TRIM(pensioner_state)) LIKE UPPER(TRIM(?))`);
            doppwParams.push(`%${state}%`);
        }

        if (bank_name) {
            doppwConditions.push(`UPPER(TRIM(branch_name)) LIKE UPPER(TRIM(?))`);
            doppwParams.push(`%${bank_name}%`);
        }

        if (district) {
            doppwConditions.push(`UPPER(TRIM(pensioner_district)) LIKE UPPER(TRIM(?))`);
            doppwParams.push(`%${district}%`);
        }

        if (pincode) {
            doppwConditions.push(`pensioner_pincode = ?`);
            doppwParams.push(pincode);
        }

        const doppwWhereClause = doppwConditions.length > 0 ? 'AND ' + doppwConditions.join(' AND ') : '';

        // Simplified query focusing on DOPPW data (main verification table)
        let baseQuery = `
            SELECT 
                UPPER(TRIM(pensioner_state)) as state_name,
                branch_name as bank_name,
                pensioner_district as district,
                pensioner_pincode as pincode,
                COUNT(*) as total_pensioners,
                COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                COUNT(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 END) as pending_pensioners,
                ROUND((COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) * 100.0 / COUNT(*)), 2) as verification_rate
            FROM doppw_pensioner_data
            WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                AND branch_name IS NOT NULL AND branch_name != ''
                AND pensioner_district IS NOT NULL AND pensioner_district != ''
                AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
        `;

        if (doppwWhereClause) {
            baseQuery += ` ${doppwWhereClause}`;
        }

        baseQuery += `
            GROUP BY pensioner_state, branch_name, pensioner_district, pensioner_pincode
            HAVING COUNT(*) >= ?
        `;

        // Add verification rate filters
        if (verification_rate_min > 0) {
            baseQuery += ` AND verification_rate >= ?`;
        }
        if (verification_rate_max < 100) {
            baseQuery += ` AND verification_rate <= ?`;
        }

        baseQuery += `
            ORDER BY verified_pensioners DESC
            LIMIT ? OFFSET ?
        `;

        const comprehensiveQuery = baseQuery;

        // Build parameters array
        let finalParams = [...doppwParams, parseInt(min_pensioners)];

        if (verification_rate_min > 0) {
            finalParams.push(parseFloat(verification_rate_min));
        }
        if (verification_rate_max < 100) {
            finalParams.push(parseFloat(verification_rate_max));
        }

        finalParams.push(parseInt(limit), parseInt(offset));

        const comprehensiveData = await new Promise((resolve, reject) => {
            db.all(comprehensiveQuery, finalParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get summary statistics
        const summaryQuery = `
            SELECT 
                COUNT(DISTINCT UPPER(TRIM(pensioner_state))) as total_states,
                COUNT(DISTINCT branch_name) as total_banks,
                COUNT(DISTINCT pensioner_district) as total_districts,
                COUNT(DISTINCT pensioner_pincode) as total_pincodes,
                COUNT(*) as grand_total_pensioners,
                COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as grand_total_verified,
                ROUND((COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) * 100.0 / COUNT(*)), 2) as overall_verification_rate
            FROM doppw_pensioner_data
            WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                AND branch_name IS NOT NULL AND branch_name != ''
                AND pensioner_district IS NOT NULL AND pensioner_district != ''
                AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
        `;

        const summaryStats = await new Promise((resolve, reject) => {
            db.get(summaryQuery, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {});
                }
            });
        });

        // Get state-wise summary (simplified)
        let stateQuery = `
            SELECT 
                UPPER(TRIM(pensioner_state)) as state_name,
                COUNT(DISTINCT branch_name) as banks_count,
                COUNT(DISTINCT pensioner_district) as districts_count,
                COUNT(DISTINCT pensioner_pincode) as pincodes_count,
                COUNT(*) as state_total_pensioners,
                COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as state_verified_pensioners,
                ROUND((COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) * 100.0 / COUNT(*)), 2) as state_verification_rate
            FROM doppw_pensioner_data
            WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                AND branch_name IS NOT NULL AND branch_name != ''
                AND pensioner_district IS NOT NULL AND pensioner_district != ''
                AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
        `;

        if (doppwWhereClause) {
            stateQuery += ` ${doppwWhereClause}`;
        }

        stateQuery += `
            GROUP BY pensioner_state
            ORDER BY state_verified_pensioners DESC
        `;

        const stateWiseQuery = stateQuery;
        let stateParams = [...doppwParams];

        const stateWiseData = await new Promise((resolve, reject) => {
            db.all(stateWiseQuery, stateParams, (err, rows) => {
                if (err) {
                    console.warn('State-wise summary query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Get total count for pagination (simplified)
        let countBaseQuery = `
            SELECT COUNT(*) as total_records
            FROM (
                SELECT 1
                FROM doppw_pensioner_data
                WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''
                    AND branch_name IS NOT NULL AND branch_name != ''
                    AND pensioner_district IS NOT NULL AND pensioner_district != ''
                    AND pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
        `;

        if (doppwWhereClause) {
            countBaseQuery += ` ${doppwWhereClause}`;
        }

        countBaseQuery += `
                GROUP BY pensioner_state, branch_name, pensioner_district, pensioner_pincode
                HAVING COUNT(*) >= ?
            )
        `;

        const countQuery = countBaseQuery;
        let countParams = [...doppwParams, parseInt(min_pensioners)];

        const totalCount = await new Promise((resolve, reject) => {
            db.get(countQuery, countParams, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row?.total_records || 0);
                }
            });
        });

        res.json({
            success: true,
            message: "Comprehensive bank-pincode data from entire database with advanced filtering",
            filters_applied: {
                state: state || null,
                bank_name: bank_name || null,
                district: district || null,
                pincode: pincode || null,
                min_pensioners: parseInt(min_pensioners),
                verification_rate_range: `${verification_rate_min}% - ${verification_rate_max}%`
            },
            comprehensive_data: comprehensiveData,
            state_wise_summary: stateWiseData,
            pagination: {
                total_records: totalCount,
                current_page: Math.floor(offset / limit) + 1,
                total_pages: Math.ceil(totalCount / limit),
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_next: (parseInt(offset) + parseInt(limit)) < totalCount,
                has_previous: parseInt(offset) > 0
            },
            national_summary: {
                total_states: summaryStats.total_states || 0,
                total_banks: summaryStats.total_banks || 0,
                total_districts: summaryStats.total_districts || 0,
                total_pincodes: summaryStats.total_pincodes || 0,
                grand_total_pensioners: summaryStats.grand_total_pensioners || 0,
                grand_total_verified: summaryStats.grand_total_verified || 0,
                overall_verification_rate: summaryStats.overall_verification_rate || 0,
                filtered_records_count: totalCount
            },
            data_sources: [
                'doppw_pensioner_data (main verification table with complete pincode data)'
            ],
            api_usage_examples: {
                filter_by_state: `/api/choropleth/comprehensive-bank-data?state=Maharashtra`,
                filter_by_bank: `/api/choropleth/comprehensive-bank-data?bank_name=State Bank`,
                filter_by_pincode: `/api/choropleth/comprehensive-bank-data?pincode=400001`,
                filter_by_verification_rate: `/api/choropleth/comprehensive-bank-data?verification_rate_min=90&verification_rate_max=100`,
                filter_by_pensioner_count: `/api/choropleth/comprehensive-bank-data?min_pensioners=1000`,
                combined_filters: `/api/choropleth/comprehensive-bank-data?state=Maharashtra&bank_name=SBI&min_pensioners=500&verification_rate_min=85`,
                pagination: `/api/choropleth/comprehensive-bank-data?limit=100&offset=200`
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in comprehensive bank data API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comprehensive bank data',
            details: error.message
        });
    } finally {
        closeDb();
    }
});

// ============================================================================
// PINCODE-WISE PENSIONER DATA API
// ============================================================================

// Comprehensive Pincode-wise Pensioner Data for any State
app.get('/api/geography/detailed-lists/:stateName', async (req, res) => {
    const { stateName } = req.params;
    const { type = 'pincodes', limit = 1000 } = req.query;

    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        // Handle state name variations, especially for Uttar Pradesh
        let stateVariations = [];
        const normalizedState = stateName.toUpperCase().trim();

        if (normalizedState.includes('UTTAR') || normalizedState === 'UTTARPRADESH') {
            stateVariations = ['UTTAR PRADESH', 'UTTARPRADESH', 'UTTARAKHAND', 'UTTARANCHAL'];
        } else {
            stateVariations = [normalizedState, normalizedState.replace(/\s+/g, '')];
        }

        let response = {
            success: true,
            state: normalizedState,
            type: type,
            timestamp: new Date().toISOString()
        };

        // Enhanced pincode-wise data query with better data quality
        if (type === 'all' || type === 'pincodes') {
            // First, try to get data from the dedicated pensioner_pincode_data table
            const pincodeDataQuery = `
                SELECT 
                    pincode,
                    COALESCE(NULLIF(TRIM(district), ''), NULLIF(TRIM(city), ''), 'Unknown District') as district,
                    city,
                    SUM(total_pensioners) as totalPensioners,
                    SUM(age_less_than_80) as ageLessThan80,
                    SUM(age_more_than_80) as ageMoreThan80,
                    SUM(age_not_available) as ageNotAvailable,
                    COUNT(DISTINCT bank_name) as uniqueBanks,
                    GROUP_CONCAT(DISTINCT data_source) as dataSources
                FROM pensioner_pincode_data
                WHERE UPPER(TRIM(state)) IN (?, ?, ?, ?)
                    AND pincode IS NOT NULL 
                    AND pincode != '' 
                    AND pincode != 'nan'
                    AND LENGTH(pincode) = 6
                    AND pincode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                    AND CAST(pincode AS INTEGER) BETWEEN 100000 AND 999999
                    AND pincode NOT IN ('111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000', '123456')
                    AND total_pensioners > 0
                GROUP BY pincode
                ORDER BY totalPensioners DESC
                ${limit ? `LIMIT ${parseInt(limit)}` : ''}
            `;

            let pincodes = await new Promise((resolve, reject) => {
                console.log('Executing pincode query with state variations:', stateVariations);
                db.all(pincodeDataQuery, stateVariations, (err, rows) => {
                    if (err) {
                        console.warn('Pincode data query failed:', err.message);
                        resolve([]);
                    } else {
                        console.log(`Found ${rows ? rows.length : 0} pincodes from pensioner_pincode_data`);
                        resolve(rows || []);
                    }
                });
            });

            // If no data from pensioner_pincode_data, fall back to other tables
            if (pincodes.length === 0) {
                const fallbackQuery = `
                    WITH pincode_data AS (
                        -- DOPPW Pensioner Data (Main verification table)
                        SELECT 
                            pensioner_pincode as pincode,
                            pensioner_district as district,
                            NULL as city,
                            COUNT(*) as total_pensioners,
                            COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                            COUNT(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 END) as pending_pensioners,
                            COUNT(DISTINCT branch_name) as unique_banks,
                            'doppw_pensioner_data' as source_table
                        FROM doppw_pensioner_data
                        WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                            AND pensioner_pincode IS NOT NULL 
                            AND pensioner_pincode != 'nan' 
                            AND pensioner_pincode != ''
                            AND LENGTH(pensioner_pincode) = 6
                            AND pensioner_pincode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                            AND CAST(pensioner_pincode AS INTEGER) BETWEEN 100000 AND 999999
                        GROUP BY pensioner_pincode, pensioner_district
                        
                        UNION ALL
                        
                        -- Bank Pensioner Data
                        SELECT 
                            branch_pin_code as pincode,
                            bank_city as district,
                            bank_city as city,
                            SUM(COALESCE(grand_total, 0)) as total_pensioners,
                            SUM(COALESCE(grand_total, 0)) as verified_pensioners,
                            0 as pending_pensioners,
                            COUNT(DISTINCT bank_name) as unique_banks,
                            'bank_pensioner_data' as source_table
                        FROM bank_pensioner_data
                        WHERE UPPER(TRIM(bank_state)) IN (${stateVariations.map(() => '?').join(', ')})
                            AND branch_pin_code IS NOT NULL 
                            AND branch_pin_code != 'nan' 
                            AND branch_pin_code != ''
                            AND LENGTH(branch_pin_code) = 6
                            AND branch_pin_code GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                            AND CAST(branch_pin_code AS INTEGER) BETWEEN 100000 AND 999999
                        GROUP BY branch_pin_code, bank_city
                        
                        UNION ALL
                        
                        -- UBI1 Pensioner Data
                        SELECT 
                            pensioner_pincode as pincode,
                            pensioner_city as district,
                            pensioner_city as city,
                            COUNT(*) as total_pensioners,
                            COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                            COUNT(CASE WHEN is_valid != 1 OR is_valid IS NULL THEN 1 END) as pending_pensioners,
                            COUNT(DISTINCT bank_name) as unique_banks,
                            'ubi1_pensioner_data' as source_table
                        FROM ubi1_pensioner_data
                        WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                            AND pensioner_pincode IS NOT NULL 
                            AND pensioner_pincode != 'nan' 
                            AND pensioner_pincode != ''
                            AND LENGTH(pensioner_pincode) = 6
                            AND pensioner_pincode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                            AND CAST(pensioner_pincode AS INTEGER) BETWEEN 100000 AND 999999
                        GROUP BY pensioner_pincode, pensioner_city
                        
                        UNION ALL
                        
                        -- UBI3 Pensioner Data
                        SELECT 
                            pensioner_pincode as pincode,
                            pensioner_city as district,
                            pensioner_city as city,
                            COUNT(*) as total_pensioners,
                            COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                            COUNT(CASE WHEN is_valid != 1 OR is_valid IS NULL THEN 1 END) as pending_pensioners,
                            COUNT(DISTINCT bank_name) as unique_banks,
                            'ubi3_pensioner_data' as source_table
                        FROM ubi3_pensioner_data
                        WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                            AND pensioner_pincode IS NOT NULL 
                            AND pensioner_pincode != 'nan' 
                            AND pensioner_pincode != ''
                            AND LENGTH(pensioner_pincode) = 6
                            AND pensioner_pincode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                            AND CAST(pensioner_pincode AS INTEGER) BETWEEN 100000 AND 999999
                        GROUP BY pensioner_pincode, pensioner_city
                    )
                    SELECT 
                        pincode,
                        COALESCE(NULLIF(TRIM(district), ''), 'Unknown District') as district,
                        city,
                        SUM(total_pensioners) as totalPensioners,
                        SUM(verified_pensioners) as verifiedPensioners,
                        SUM(pending_pensioners) as pendingPensioners,
                        SUM(unique_banks) as uniqueBanks,
                        ROUND((SUM(verified_pensioners) * 100.0 / NULLIF(SUM(total_pensioners), 0)), 2) as verificationRate,
                        GROUP_CONCAT(DISTINCT source_table) as dataSources
                    FROM pincode_data
                    WHERE total_pensioners > 0
                    GROUP BY pincode
                    ORDER BY totalPensioners DESC
                    ${limit ? `LIMIT ${parseInt(limit)}` : ''}
                `;

                const allStateParams = stateVariations.concat(stateVariations, stateVariations, stateVariations);

                pincodes = await new Promise((resolve, reject) => {
                    db.all(fallbackQuery, allStateParams, (err, rows) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(rows || []);
                        }
                    });
                });
            }

            // Format the response
            response.pincodes = pincodes.map(row => ({
                pincode: row.pincode,
                district: row.district,
                city: row.city,
                totalPensioners: row.totalPensioners,
                verifiedPensioners: row.verifiedPensioners || 0,
                pendingPensioners: row.pendingPensioners || 0,
                verificationRate: row.verificationRate || 0,
                uniqueBanks: row.uniqueBanks || 0,
                ageBreakdown: {
                    lessThan80: row.ageLessThan80 || 0,
                    moreThan80: row.ageMoreThan80 || 0,
                    ageNotAvailable: row.ageNotAvailable || 0
                },
                dataSources: row.dataSources ? row.dataSources.split(',') : []
            }));
        }

        // Districts data query
        if (type === 'all' || type === 'districts') {
            const districtQuery = `
                WITH district_data AS (
                    SELECT 
                        pensioner_district as district,
                        COUNT(*) as total_pensioners,
                        COUNT(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 END) as verified_pensioners,
                        COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                        COUNT(DISTINCT branch_name) as unique_banks
                    FROM doppw_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))
                        AND pensioner_district IS NOT NULL 
                        AND pensioner_district != 'nan' 
                        AND pensioner_district != ''
                    GROUP BY pensioner_district
                    
                    UNION ALL
                    
                    SELECT 
                        bank_city as district,
                        SUM(COALESCE(grand_total, 0)) as total_pensioners,
                        SUM(COALESCE(grand_total, 0)) as verified_pensioners,
                        COUNT(DISTINCT branch_pin_code) as unique_pincodes,
                        COUNT(DISTINCT bank_name) as unique_banks
                    FROM bank_pensioner_data
                    WHERE UPPER(TRIM(bank_state)) = UPPER(TRIM(?))
                        AND bank_city IS NOT NULL 
                        AND bank_city != 'nan' 
                        AND bank_city != ''
                    GROUP BY bank_city
                )
                SELECT 
                    district,
                    SUM(total_pensioners) as totalPensioners,
                    SUM(verified_pensioners) as verifiedPensioners,
                    SUM(total_pensioners) - SUM(verified_pensioners) as pendingPensioners,
                    MAX(unique_pincodes) as totalPincodes,
                    SUM(unique_banks) as uniqueBanks,
                    ROUND((SUM(verified_pensioners) * 100.0 / NULLIF(SUM(total_pensioners), 0)), 2) as verificationRate
                FROM district_data
                GROUP BY district
                ORDER BY totalPensioners DESC
                ${limit ? `LIMIT ${parseInt(limit)}` : ''}
            `;

            const districts = await new Promise((resolve, reject) => {
                db.all(districtQuery, [stateName, stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });

            response.districts = districts;
        }

        // Cities data query (from UBI tables)
        if (type === 'all' || type === 'cities') {
            const cityQuery = `
                WITH city_data AS (
                    SELECT 
                        pensioner_city as city,
                        COUNT(*) as total_pensioners,
                        COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                        COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                        COUNT(DISTINCT bank_name) as unique_banks
                    FROM ubi1_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))
                        AND pensioner_city IS NOT NULL 
                        AND pensioner_city != 'nan' 
                        AND pensioner_city != ''
                    GROUP BY pensioner_city
                    
                    UNION ALL
                    
                    SELECT 
                        pensioner_city as city,
                        COUNT(*) as total_pensioners,
                        COUNT(CASE WHEN is_valid = 1 THEN 1 END) as verified_pensioners,
                        COUNT(DISTINCT pensioner_pincode) as unique_pincodes,
                        COUNT(DISTINCT bank_name) as unique_banks
                    FROM ubi3_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) = UPPER(TRIM(?))
                        AND pensioner_city IS NOT NULL 
                        AND pensioner_city != 'nan' 
                        AND pensioner_city != ''
                    GROUP BY pensioner_city
                )
                SELECT 
                    city,
                    SUM(total_pensioners) as totalPensioners,
                    SUM(verified_pensioners) as verifiedPensioners,
                    SUM(total_pensioners) - SUM(verified_pensioners) as pendingPensioners,
                    MAX(unique_pincodes) as totalPincodes,
                    SUM(unique_banks) as uniqueBanks,
                    ROUND((SUM(verified_pensioners) * 100.0 / NULLIF(SUM(total_pensioners), 0)), 2) as verificationRate
                FROM city_data
                GROUP BY city
                ORDER BY totalPensioners DESC
                ${limit ? `LIMIT ${parseInt(limit)}` : ''}
            `;

            const cities = await new Promise((resolve, reject) => {
                db.all(cityQuery, [stateName, stateName], (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });

            response.cities = cities;
        }

        // Enhanced summary statistics using pensioner_pincode_data first
        let summary = {};

        // Try pensioner_pincode_data first
        const pincodeDataSummaryQuery = `
            SELECT 
                COUNT(DISTINCT pincode) as total_pincodes,
                COUNT(DISTINCT COALESCE(NULLIF(TRIM(district), ''), NULLIF(TRIM(city), ''), 'Unknown')) as total_districts,
                SUM(total_pensioners) as total_pensioners,
                COUNT(DISTINCT city) as total_cities
            FROM pensioner_pincode_data
            WHERE UPPER(TRIM(state)) IN (${stateVariations.map(() => '?').join(', ')})
                AND pincode IS NOT NULL 
                AND pincode != 'nan' 
                AND pincode != ''
                AND LENGTH(pincode) = 6
                AND pincode GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
                AND CAST(pincode AS INTEGER) BETWEEN 100000 AND 999999
                AND pincode NOT IN ('111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000', '123456')
                AND total_pensioners > 0
        `;

        summary = await new Promise((resolve, reject) => {
            db.get(pincodeDataSummaryQuery, stateVariations, (err, row) => {
                if (err) {
                    console.warn('Pincode data summary query error:', err.message);
                    resolve({});
                } else {
                    resolve(row || {});
                }
            });
        });

        // If no data from pensioner_pincode_data, fall back to other tables
        if (!summary.total_pensioners || summary.total_pensioners === 0) {
            const fallbackSummaryQuery = `
                WITH combined_data AS (
                    SELECT pensioner_pincode as pincode, pensioner_district as district, 1 as pensioner_count
                    FROM doppw_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                        AND pensioner_pincode IS NOT NULL 
                        AND pensioner_pincode != 'nan' 
                        AND pensioner_pincode != ''
                        AND LENGTH(pensioner_pincode) = 6
                    
                    UNION ALL
                    
                    SELECT pensioner_pincode as pincode, pensioner_city as district, 1 as pensioner_count
                    FROM ubi1_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                        AND pensioner_pincode IS NOT NULL 
                        AND pensioner_pincode != 'nan' 
                        AND pensioner_pincode != ''
                        AND LENGTH(pensioner_pincode) = 6
                    
                    UNION ALL
                    
                    SELECT pensioner_pincode as pincode, pensioner_city as district, 1 as pensioner_count
                    FROM ubi3_pensioner_data
                    WHERE UPPER(TRIM(pensioner_state)) IN (${stateVariations.map(() => '?').join(', ')})
                        AND pensioner_pincode IS NOT NULL 
                        AND pensioner_pincode != 'nan' 
                        AND pensioner_pincode != ''
                        AND LENGTH(pensioner_pincode) = 6
                )
                SELECT 
                    COUNT(DISTINCT pincode) as total_pincodes,
                    COUNT(DISTINCT district) as total_districts,
                    COUNT(*) as total_pensioners,
                    COUNT(DISTINCT district) as total_cities
                FROM combined_data
            `;

            const allStateParams = stateVariations.concat(stateVariations, stateVariations);

            summary = await new Promise((resolve, reject) => {
                db.get(fallbackSummaryQuery, allStateParams, (err, row) => {
                    if (err) {
                        console.warn('Fallback summary query error:', err.message);
                        resolve({});
                    } else {
                        resolve(row || {});
                    }
                });
            });
        }

        response.summary = {
            totalDistricts: summary.total_districts || 0,
            totalCities: summary.total_cities || 0,
            totalPincodes: summary.total_pincodes || 0,
            totalPensioners: summary.total_pensioners || 0,
            dataSource: summary.total_pensioners > 0 ? 'pensioner_pincode_data' : 'multiple_tables'
        };

        response.dataSources = [
            'doppw_pensioner_data (main verification table)',
            'bank_pensioner_data (bank aggregated data)',
            'ubi1_pensioner_data (UBI1 individual records)',
            'ubi3_pensioner_data (UBI3 individual records)'
        ];

        res.json(response);

    } catch (error) {
        console.error('Error in pincode analysis API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pincode data',
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
app.use(excelAnalyzerRouter);

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
    console.log(`\n🔍 FILTERING EXAMPLES:`);
    console.log(`   📍 By State: /api/choropleth/comprehensive-bank-data?state=Maharashtra`);
    console.log(`   🏦 By Bank: /api/choropleth/comprehensive-bank-data?bank_name=SBI`);
    console.log(`   📮 By Pincode: /api/choropleth/comprehensive-bank-data?pincode=400001`);
    console.log(`   📊 By Verification Rate: /api/choropleth/comprehensive-bank-data?verification_rate_min=90`);
    console.log(`   👥 By Pensioner Count: /api/choropleth/comprehensive-bank-data?min_pensioners=1000`);
    console.log(`   🔗 Combined Filters: /api/choropleth/comprehensive-bank-data?state=Maharashtra&bank_name=SBI&min_pensioners=500`);
    console.log(`\n📍 NEW PINCODE-WISE APIs:`);
    console.log(`🏘️  Detailed Lists: http://${HOST}:${PORT}/api/geography/detailed-lists/:stateName?type=pincodes&limit=1000`);
    console.log(`📮 Pincode Summary: http://${HOST}:${PORT}/api/geography/pincode-summary/:stateName`);
    console.log(`\n🚀 SBI EIS GEN 6 Server listening on ${HOST}:${PORT}`);
    console.log(`📊 Excel Files Manager: http://${HOST}:${PORT}/excel-files.html`);
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

// Excel Files Management API
// fs and path already required above

// Get all Excel files in the Excel Files directory
app.get('/api/excel-files', async (req, res) => {
    try {
        const excelDir = path.join(__dirname, 'Excel Files');
        console.log(`📁 Scanning Excel files directory: ${excelDir}`);

        if (!fs.existsSync(excelDir)) {
            return res.status(404).json({
                success: false,
                message: 'Excel Files directory not found',
                path: excelDir
            });
        }

        // Function to recursively get all Excel files
        function getExcelFiles(dir, relativePath = '') {
            const files = [];
            const items = fs.readdirSync(dir);

            for (const item of items) {
                const fullPath = path.join(dir, item);
                const relativeItemPath = path.join(relativePath, item);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    // Recursively get files from subdirectories
                    const subFiles = getExcelFiles(fullPath, relativeItemPath);
                    files.push(...subFiles);
                } else if (stats.isFile() && (item.endsWith('.xlsx') || item.endsWith('.xls'))) {
                    files.push({
                        name: item,
                        path: relativeItemPath,
                        fullPath: fullPath,
                        size: stats.size,
                        sizeFormatted: formatFileSize(stats.size),
                        lastModified: stats.mtime,
                        lastModifiedFormatted: stats.mtime.toLocaleString('en-IN'),
                        directory: relativePath || 'Root',
                        extension: path.extname(item)
                    });
                }
            }

            return files;
        }

        // Helper function to format file size
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        const excelFiles = getExcelFiles(excelDir);

        // Group files by directory
        const filesByDirectory = {};
        excelFiles.forEach(file => {
            const dir = file.directory;
            if (!filesByDirectory[dir]) {
                filesByDirectory[dir] = [];
            }
            filesByDirectory[dir].push(file);
        });

        // Calculate statistics
        const stats = {
            totalFiles: excelFiles.length,
            totalSize: excelFiles.reduce((sum, file) => sum + file.size, 0),
            directories: Object.keys(filesByDirectory).length,
            byExtension: {
                xlsx: excelFiles.filter(f => f.extension === '.xlsx').length,
                xls: excelFiles.filter(f => f.extension === '.xls').length
            }
        };

        stats.totalSizeFormatted = formatFileSize(stats.totalSize);

        console.log(`✅ Found ${excelFiles.length} Excel files in ${Object.keys(filesByDirectory).length} directories`);

        res.json({
            success: true,
            message: `Found ${excelFiles.length} Excel files`,
            data: {
                files: excelFiles,
                filesByDirectory: filesByDirectory,
                statistics: stats
            }
        });

    } catch (error) {
        console.error('Error scanning Excel files:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to scan Excel files'
        });
    }
});

// Get available dates (directories) in Excel Files folder
app.get('/api/excel-files/dates', async (req, res) => {
    try {
        const excelDir = path.join(__dirname, 'Excel Files');

        if (!fs.existsSync(excelDir)) {
            return res.json({
                success: true,
                message: 'No Excel Files directory found',
                data: { dates: [] }
            });
        }

        const items = fs.readdirSync(excelDir);
        const dates = [];

        // Add root directory files
        const rootFiles = items.filter(item => {
            const fullPath = path.join(excelDir, item);
            return fs.statSync(fullPath).isFile() && (item.endsWith('.xlsx') || item.endsWith('.xls'));
        });

        if (rootFiles.length > 0) {
            dates.push({
                folder: 'Root',
                displayName: 'Older Files (Root)',
                fileCount: rootFiles.length,
                isDirectory: false
            });
        }

        // Add date directories
        const directories = items.filter(item => {
            const fullPath = path.join(excelDir, item);
            return fs.statSync(fullPath).isDirectory();
        }).sort().reverse(); // Most recent first

        directories.forEach(dir => {
            const dirPath = path.join(excelDir, dir);
            const dirFiles = fs.readdirSync(dirPath).filter(file =>
                file.endsWith('.xlsx') || file.endsWith('.xls')
            );

            if (dirFiles.length > 0) {
                dates.push({
                    folder: dir,
                    displayName: `${dir} (${dirFiles.length} files)`,
                    fileCount: dirFiles.length,
                    isDirectory: true
                });
            }
        });

        res.json({
            success: true,
            message: `Found ${dates.length} date folders`,
            data: { dates }
        });

    } catch (error) {
        console.error('Error getting dates:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get available dates'
        });
    }
});

// Get Excel files by date
app.get('/api/excel-files/by-date/:dateFolder', async (req, res) => {
    try {
        const { dateFolder } = req.params;
        const excelDir = path.join(__dirname, 'Excel Files');

        let targetDir;
        if (dateFolder === 'Root') {
            targetDir = excelDir;
        } else {
            targetDir = path.join(excelDir, dateFolder);
        }

        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({
                success: false,
                message: `Date folder '${dateFolder}' not found`
            });
        }

        const files = [];
        const items = fs.readdirSync(targetDir);

        for (const item of items) {
            const fullPath = path.join(targetDir, item);
            const stats = fs.statSync(fullPath);

            if (stats.isFile() && (item.endsWith('.xlsx') || item.endsWith('.xls'))) {
                const filePath = dateFolder === 'Root' ? item : `${dateFolder}/${item}`;

                files.push({
                    name: item,
                    path: filePath,
                    fullPath: fullPath,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    lastModified: stats.mtime,
                    lastModifiedFormatted: stats.mtime.toLocaleString('en-IN'),
                    directory: dateFolder,
                    extension: path.extname(item)
                });
            }
        }

        // Sort by last modified (newest first)
        files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        res.json({
            success: true,
            message: `Found ${files.length} Excel files in ${dateFolder}`,
            data: {
                files,
                dateFolder,
                fileCount: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                totalSizeFormatted: formatFileSize(files.reduce((sum, file) => sum + file.size, 0))
            }
        });

    } catch (error) {
        console.error('Error getting files by date:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get files by date'
        });
    }
});

// Get details of a specific Excel file
app.get('/api/excel-files/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const excelDir = path.join(__dirname, 'Excel Files');

        // Find the file recursively
        function findFile(dir, targetFile) {
            const items = fs.readdirSync(dir);

            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    const found = findFile(fullPath, targetFile);
                    if (found) return found;
                } else if (item === targetFile) {
                    return {
                        name: item,
                        fullPath: fullPath,
                        size: stats.size,
                        sizeFormatted: formatFileSize(stats.size),
                        lastModified: stats.mtime,
                        lastModifiedFormatted: stats.mtime.toLocaleString('en-IN'),
                        directory: path.relative(excelDir, path.dirname(fullPath)) || 'Root'
                    };
                }
            }
            return null;
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        const fileInfo = findFile(excelDir, filename);

        if (!fileInfo) {
            return res.status(404).json({
                success: false,
                message: `Excel file '${filename}' not found`
            });
        }

        // Try to get Excel sheet information
        try {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(fileInfo.fullPath);

            const sheets = workbook.worksheets.map(sheet => ({
                name: sheet.name,
                rowCount: sheet.rowCount,
                columnCount: sheet.columnCount,
                hasData: sheet.rowCount > 0
            }));

            fileInfo.sheets = sheets;
            fileInfo.totalSheets = sheets.length;

        } catch (excelError) {
            console.warn(`Could not read Excel file details: ${excelError.message}`);
            fileInfo.sheets = [];
            fileInfo.totalSheets = 0;
            fileInfo.excelError = excelError.message;
        }

        res.json({
            success: true,
            message: `File details for ${filename}`,
            data: fileInfo
        });

    } catch (error) {
        console.error('Error getting file details:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get file details'
        });
    }
});

// Create file processing tracking table if it doesn't exist
function initializeFileTrackingTable() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS file_processing_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            records_processed INTEGER DEFAULT 0,
            processing_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            error_message TEXT,
            file_size INTEGER,
            UNIQUE(filename, file_path)
        )
    `;

    globalDb.run(createTableQuery, (err) => {
        if (err) {
            console.error('Error creating file_processing_log table:', err);
        } else {
            console.log('File processing tracking table initialized');
        }
    });
}

// Initialize the tracking table
initializeFileTrackingTable();

// Get processing status for all files
app.get('/api/excel-files/processing/status', async (req, res) => {
    try {
        const query = `
            SELECT filename, file_path, status, records_processed, 
                   processing_date, error_message, file_size
            FROM file_processing_log 
            ORDER BY updated_at DESC
        `;

        globalDb.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching processing status:', err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }

            // Create a map for quick lookup
            const statusMap = {};
            rows.forEach(row => {
                const key = `${row.filename}|${row.file_path}`;
                statusMap[key] = {
                    status: row.status,
                    recordsProcessed: row.records_processed,
                    processingDate: row.processing_date,
                    errorMessage: row.error_message,
                    fileSize: row.file_size
                };
            });

            res.json({
                success: true,
                message: `Found processing status for ${rows.length} files`,
                data: statusMap
            });
        });

    } catch (error) {
        console.error('Error getting processing status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Mark a file as processed
app.post('/api/excel-files/processing/mark', async (req, res) => {
    try {
        const { filename, filePath, status, recordsProcessed, errorMessage } = req.body;

        if (!filename || !filePath || !status) {
            return res.status(400).json({
                success: false,
                message: 'filename, filePath, and status are required'
            });
        }

        const query = `
            INSERT OR REPLACE INTO file_processing_log 
            (filename, file_path, status, records_processed, processing_date, error_message, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
        `;

        globalDb.run(query, [filename, filePath, status, recordsProcessed || 0, errorMessage || null], function (err) {
            if (err) {
                console.error('Error updating processing status:', err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }

            res.json({
                success: true,
                message: `Processing status updated for ${filename}`,
                data: {
                    id: this.lastID,
                    filename,
                    filePath,
                    status,
                    recordsProcessed: recordsProcessed || 0
                }
            });
        });

    } catch (error) {
        console.error('Error marking file as processed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create date-based folder
        const today = new Date();
        const dateFolder = `${today.getDate().toString().padStart(2, '0')}${today.toLocaleString('en-US', { month: 'short' })}`;
        const uploadPath = path.join(__dirname, 'Excel Files', dateFolder);

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            console.log(`📁 Created upload directory: ${uploadPath}`);
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
    }
});

// File filter to only allow Excel files
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
        cb(null, true);
    } else {
        cb(new Error('Only Excel files (.xlsx, .xls) are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Upload Excel files endpoint
app.post('/api/excel-files/upload', upload.array('excelFiles', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const uploadedFiles = req.files.map(file => {
            const today = new Date();
            const dateFolder = `${today.getDate().toString().padStart(2, '0')}${today.toLocaleString('en-US', { month: 'short' })}`;

            return {
                originalName: file.originalname,
                filename: file.filename,
                size: file.size,
                sizeFormatted: formatFileSize(file.size),
                path: path.join(dateFolder, file.filename),
                uploadDate: new Date().toISOString(),
                uploadDateFormatted: new Date().toLocaleString('en-IN')
            };
        });

        console.log(`📤 Uploaded ${req.files.length} Excel files:`);
        uploadedFiles.forEach(file => {
            console.log(`   📊 ${file.originalName} (${file.sizeFormatted})`);
        });

        res.json({
            success: true,
            message: `Successfully uploaded ${req.files.length} file(s)`,
            data: {
                files: uploadedFiles,
                uploadCount: req.files.length,
                totalSize: req.files.reduce((sum, file) => sum + file.size, 0),
                totalSizeFormatted: formatFileSize(req.files.reduce((sum, file) => sum + file.size, 0))
            }
        });

    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to upload files'
        });
    }
});

// Get available dates (directories) in Excel Files folder
app.get('/api/excel-files/dates', async (req, res) => {
    try {
        const excelDir = path.join(__dirname, 'Excel Files');

        if (!fs.existsSync(excelDir)) {
            return res.json({
                success: true,
                message: 'No Excel Files directory found',
                data: { dates: [] }
            });
        }

        const items = fs.readdirSync(excelDir);
        const dates = [];

        // Add root directory files
        const rootFiles = items.filter(item => {
            const fullPath = path.join(excelDir, item);
            return fs.statSync(fullPath).isFile() && (item.endsWith('.xlsx') || item.endsWith('.xls'));
        });

        if (rootFiles.length > 0) {
            dates.push({
                folder: 'Root',
                displayName: 'Older Files (Root)',
                fileCount: rootFiles.length,
                isDirectory: false
            });
        }

        // Add date directories
        const directories = items.filter(item => {
            const fullPath = path.join(excelDir, item);
            return fs.statSync(fullPath).isDirectory();
        }).sort().reverse(); // Most recent first

        directories.forEach(dir => {
            const dirPath = path.join(excelDir, dir);
            const dirFiles = fs.readdirSync(dirPath).filter(file =>
                file.endsWith('.xlsx') || file.endsWith('.xls')
            );

            if (dirFiles.length > 0) {
                dates.push({
                    folder: dir,
                    displayName: `${dir} (${dirFiles.length} files)`,
                    fileCount: dirFiles.length,
                    isDirectory: true
                });
            }
        });

        res.json({
            success: true,
            message: `Found ${dates.length} date folders`,
            data: { dates }
        });

    } catch (error) {
        console.error('Error getting dates:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get available dates'
        });
    }
});

// Get Excel files by date
app.get('/api/excel-files/by-date/:dateFolder', async (req, res) => {
    try {
        const { dateFolder } = req.params;
        const excelDir = path.join(__dirname, 'Excel Files');

        let targetDir;
        if (dateFolder === 'Root') {
            targetDir = excelDir;
        } else {
            targetDir = path.join(excelDir, dateFolder);
        }

        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({
                success: false,
                message: `Date folder '${dateFolder}' not found`
            });
        }

        const files = [];
        const items = fs.readdirSync(targetDir);

        for (const item of items) {
            const fullPath = path.join(targetDir, item);
            const stats = fs.statSync(fullPath);

            if (stats.isFile() && (item.endsWith('.xlsx') || item.endsWith('.xls'))) {
                const filePath = dateFolder === 'Root' ? item : `${dateFolder}/${item}`;

                files.push({
                    name: item,
                    path: filePath,
                    fullPath: fullPath,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    lastModified: stats.mtime,
                    lastModifiedFormatted: stats.mtime.toLocaleString('en-IN'),
                    directory: dateFolder,
                    extension: path.extname(item)
                });
            }
        }

        // Sort by last modified (newest first)
        files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        res.json({
            success: true,
            message: `Found ${files.length} Excel files in ${dateFolder}`,
            data: {
                files,
                dateFolder,
                fileCount: files.length,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                totalSizeFormatted: formatFileSize(files.reduce((sum, file) => sum + file.size, 0))
            }
        });

    } catch (error) {
        console.error('Error getting files by date:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to get files by date'
        });
    }
});


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
(count(LC_date)/count(*))*100 as completion_ratio
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
app.use('/api/pincode', pincodeApiRouter);

// Server already started above - no need for duplicate listen call
