const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

/**
 * Get comprehensive geographic analysis for a state
 * Returns districts count, pincodes per district, and pensioner data
 * @param {string} stateName - Name of the state to analyze
 * @returns {Object} Geographic analysis data
 */
async function getStateGeographicAnalysis(stateName) {
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
            totalDistricts: 0,
            totalPincodes: 0,
            totalPensioners: 0,
            districts: [],
            summary: {
                dataSources: [
                    'doppw_pensioner_data',
                    'dot_pensioner_data', 
                    'bank_pensioner_data',
                    'ubi3_pensioner_data',
                    'ubi1_pensioner_data'
                ],
                timestamp: new Date().toISOString()
            }
        };

        // Query 1: DOPPW table - Main verification data with districts and pincodes
        const doppwQuery = `
            SELECT 
                pensioner_district as district,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count,
                SUM(CASE WHEN submitted_status IS NOT NULL AND UPPER(submitted_status) IN ('VERIFIED', 'SUBMITTED') THEN 1 ELSE 0 END) as verified_count,
                SUM(CASE WHEN submitted_status IS NULL OR UPPER(submitted_status) NOT IN ('VERIFIED', 'SUBMITTED', 'WAIVED') THEN 1 ELSE 0 END) as pending_count
            FROM doppw_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_district IS NOT NULL 
                AND pensioner_district != 'nan' 
                AND pensioner_district != ''
                AND pensioner_pincode IS NOT NULL
                AND pensioner_pincode != 'nan'
                AND pensioner_pincode != ''
            GROUP BY pensioner_district, pensioner_pincode
            ORDER BY pensioner_district, pensioner_count DESC
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

        // Query 2: DOT table - Additional pincode data
        const dotQuery = `
            SELECT 
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count
            FROM dot_pensioner_data
            WHERE pensioner_pincode IS NOT NULL 
                AND pensioner_pincode != 'nan' 
                AND pensioner_pincode != ''
            GROUP BY pensioner_pincode
        `;

        const dotData = await new Promise((resolve, reject) => {
            db.all(dotQuery, [], (err, rows) => {
                if (err) {
                    console.warn('DOT query failed:', err.message);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });

        // Query 3: Bank table - City-wise data (we'll map cities to districts)
        const bankQuery = `
            SELECT 
                bank_city as city,
                branch_pin_code as pincode,
                SUM(COALESCE(grand_total, 0)) as pensioner_count
            FROM bank_pensioner_data
            WHERE UPPER(bank_state) = UPPER(?)
                AND bank_city IS NOT NULL 
                AND bank_city != 'nan' 
                AND bank_city != ''
                AND branch_pin_code IS NOT NULL
                AND branch_pin_code != 'nan'
                AND branch_pin_code != ''
            GROUP BY bank_city, branch_pin_code
            ORDER BY bank_city, pensioner_count DESC
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

        // Query 4: UBI3 table - City and pincode data
        const ubi3Query = `
            SELECT 
                pensioner_city as city,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count
            FROM ubi3_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_city IS NOT NULL 
                AND pensioner_city != 'nan' 
                AND pensioner_city != ''
                AND pensioner_pincode IS NOT NULL
                AND pensioner_pincode != 'nan'
                AND pensioner_pincode != ''
            GROUP BY pensioner_city, pensioner_pincode
            ORDER BY pensioner_city, pensioner_count DESC
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

        // Query 5: UBI1 table - City and pincode data
        const ubi1Query = `
            SELECT 
                pensioner_city as city,
                pensioner_pincode as pincode,
                COUNT(*) as pensioner_count
            FROM ubi1_pensioner_data
            WHERE UPPER(pensioner_state) = UPPER(?)
                AND pensioner_city IS NOT NULL 
                AND pensioner_city != 'nan' 
                AND pensioner_city != ''
                AND pensioner_pincode IS NOT NULL
                AND pensioner_pincode != 'nan'
                AND pensioner_pincode != ''
            GROUP BY pensioner_city, pensioner_pincode
            ORDER BY pensioner_city, pensioner_count DESC
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

        // Create DOT pincode lookup for additional data
        const dotPincodeMap = new Map();
        dotData.forEach(row => {
            if (row.pincode) {
                dotPincodeMap.set(row.pincode.toString(), row.pensioner_count);
            }
        });

        // Process Districts and Pincodes from DOPPW data (main source)
        const districtMap = new Map();

        doppwData.forEach(row => {
            if (row.district && row.pincode) {
                const districtKey = row.district.toUpperCase().trim();
                const pincode = row.pincode.toString();
                
                if (!districtMap.has(districtKey)) {
                    districtMap.set(districtKey, {
                        district: row.district,
                        totalPensioners: 0,
                        verifiedPensioners: 0,
                        pendingPensioners: 0,
                        totalPincodes: 0,
                        pincodes: new Map(),
                        dataSources: ['doppw_pensioner_data']
                    });
                }

                const district = districtMap.get(districtKey);
                district.totalPensioners += row.pensioner_count;
                district.verifiedPensioners += row.verified_count;
                district.pendingPensioners += row.pending_count;

                // Add pincode data
                if (!district.pincodes.has(pincode)) {
                    district.pincodes.set(pincode, {
                        pincode: pincode,
                        pensioners: 0,
                        verified: 0,
                        pending: 0,
                        additionalSources: []
                    });
                }

                const pincodeData = district.pincodes.get(pincode);
                pincodeData.pensioners += row.pensioner_count;
                pincodeData.verified += row.verified_count;
                pincodeData.pending += row.pending_count;

                // Add DOT data if available for this pincode
                if (dotPincodeMap.has(pincode)) {
                    pincodeData.pensioners += dotPincodeMap.get(pincode);
                    pincodeData.additionalSources.push('dot_pensioner_data');
                }
            }
        });

        // Add Bank data (map cities to districts - simplified mapping)
        const cityToDistrictMapping = {
            // Major city to district mappings for common cases
            'BANGALORE': 'Bangalore',
            'BENGALURU': 'Bangalore', 
            'MUMBAI': 'Mumbai',
            'DELHI': 'Delhi',
            'CHENNAI': 'Chennai',
            'KOLKATA': 'Kolkata',
            'HYDERABAD': 'Hyderabad',
            'PUNE': 'Pune',
            'AHMEDABAD': 'Ahmedabad',
            'JAIPUR': 'Jaipur',
            'LUCKNOW': 'Lucknow',
            'KANPUR': 'Kanpur',
            'NAGPUR': 'Nagpur',
            'INDORE': 'Indore',
            'BHOPAL': 'Bhopal',
            'PATNA': 'Patna'
        };

        bankData.forEach(row => {
            if (row.city && row.pincode) {
                const cityUpper = row.city.toUpperCase().trim();
                const mappedDistrict = cityToDistrictMapping[cityUpper] || row.city;
                const districtKey = mappedDistrict.toUpperCase().trim();
                const pincode = row.pincode.toString();

                if (!districtMap.has(districtKey)) {
                    districtMap.set(districtKey, {
                        district: mappedDistrict,
                        totalPensioners: 0,
                        verifiedPensioners: 0,
                        pendingPensioners: 0,
                        totalPincodes: 0,
                        pincodes: new Map(),
                        dataSources: ['bank_pensioner_data']
                    });
                } else {
                    const existing = districtMap.get(districtKey);
                    if (!existing.dataSources.includes('bank_pensioner_data')) {
                        existing.dataSources.push('bank_pensioner_data');
                    }
                }

                const districtData = districtMap.get(districtKey);
                districtData.totalPensioners += row.pensioner_count;

                if (!districtData.pincodes.has(pincode)) {
                    districtData.pincodes.set(pincode, {
                        pincode: pincode,
                        pensioners: 0,
                        verified: 0,
                        pending: 0,
                        additionalSources: []
                    });
                }

                const pincodeData = districtData.pincodes.get(pincode);
                pincodeData.pensioners += row.pensioner_count;
                if (!pincodeData.additionalSources.includes('bank_pensioner_data')) {
                    pincodeData.additionalSources.push('bank_pensioner_data');
                }
            }
        });

        // Add UBI3 data
        ubi3Data.forEach(row => {
            if (row.city && row.pincode) {
                const cityUpper = row.city.toUpperCase().trim();
                const mappedDistrict = cityToDistrictMapping[cityUpper] || row.city;
                const districtKey = mappedDistrict.toUpperCase().trim();
                const pincode = row.pincode.toString();

                if (!districtMap.has(districtKey)) {
                    districtMap.set(districtKey, {
                        district: mappedDistrict,
                        totalPensioners: 0,
                        verifiedPensioners: 0,
                        pendingPensioners: 0,
                        totalPincodes: 0,
                        pincodes: new Map(),
                        dataSources: ['ubi3_pensioner_data']
                    });
                } else {
                    const existing = districtMap.get(districtKey);
                    if (!existing.dataSources.includes('ubi3_pensioner_data')) {
                        existing.dataSources.push('ubi3_pensioner_data');
                    }
                }

                const districtData = districtMap.get(districtKey);
                districtData.totalPensioners += row.pensioner_count;

                if (!districtData.pincodes.has(pincode)) {
                    districtData.pincodes.set(pincode, {
                        pincode: pincode,
                        pensioners: 0,
                        verified: 0,
                        pending: 0,
                        additionalSources: []
                    });
                }

                const pincodeData = districtData.pincodes.get(pincode);
                pincodeData.pensioners += row.pensioner_count;
                if (!pincodeData.additionalSources.includes('ubi3_pensioner_data')) {
                    pincodeData.additionalSources.push('ubi3_pensioner_data');
                }
            }
        });

        // Add UBI1 data
        ubi1Data.forEach(row => {
            if (row.city && row.pincode) {
                const cityUpper = row.city.toUpperCase().trim();
                const mappedDistrict = cityToDistrictMapping[cityUpper] || row.city;
                const districtKey = mappedDistrict.toUpperCase().trim();
                const pincode = row.pincode.toString();

                if (!districtMap.has(districtKey)) {
                    districtMap.set(districtKey, {
                        district: mappedDistrict,
                        totalPensioners: 0,
                        verifiedPensioners: 0,
                        pendingPensioners: 0,
                        totalPincodes: 0,
                        pincodes: new Map(),
                        dataSources: ['ubi1_pensioner_data']
                    });
                } else {
                    const existing = districtMap.get(districtKey);
                    if (!existing.dataSources.includes('ubi1_pensioner_data')) {
                        existing.dataSources.push('ubi1_pensioner_data');
                    }
                }

                const districtData = districtMap.get(districtKey);
                districtData.totalPensioners += row.pensioner_count;

                if (!districtData.pincodes.has(pincode)) {
                    districtData.pincodes.set(pincode, {
                        pincode: pincode,
                        pensioners: 0,
                        verified: 0,
                        pending: 0,
                        additionalSources: []
                    });
                }

                const pincodeData = districtData.pincodes.get(pincode);
                pincodeData.pensioners += row.pensioner_count;
                if (!pincodeData.additionalSources.includes('ubi1_pensioner_data')) {
                    pincodeData.additionalSources.push('ubi1_pensioner_data');
                }
            }
        });

        // Convert to final format
        result.districts = Array.from(districtMap.values()).map(district => {
            const pincodeArray = Array.from(district.pincodes.values()).map(pincode => ({
                pincode: pincode.pincode,
                pensioners: pincode.pensioners,
                verified: pincode.verified,
                pending: pincode.pending,
                verificationRate: pincode.pensioners > 0 ? 
                    parseFloat(((pincode.verified / pincode.pensioners) * 100).toFixed(2)) : 0,
                dataSources: ['doppw_pensioner_data', ...pincode.additionalSources]
            })).sort((a, b) => b.pensioners - a.pensioners);

            district.totalPincodes = pincodeArray.length;
            
            return {
                district: district.district,
                totalPensioners: district.totalPensioners,
                verifiedPensioners: district.verifiedPensioners,
                pendingPensioners: district.pendingPensioners,
                totalPincodes: district.totalPincodes,
                verificationRate: district.totalPensioners > 0 ? 
                    parseFloat(((district.verifiedPensioners / district.totalPensioners) * 100).toFixed(2)) : 0,
                pincodes: pincodeArray,
                dataSources: district.dataSources
            };
        }).sort((a, b) => b.totalPensioners - a.totalPensioners);

        // Calculate totals
        result.totalDistricts = result.districts.length;
        result.totalPincodes = result.districts.reduce((sum, district) => sum + district.totalPincodes, 0);
        result.totalPensioners = result.districts.reduce((sum, district) => sum + district.totalPensioners, 0);

        return result;

    } finally {
        closeDb();
    }
}

/**
 * Get all available states from all tables
 * @returns {Array} List of available states
 */
async function getAllAvailableStates() {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

    const closeDb = () => {
        db.close(err => {
            if (err) {
                console.warn('Warning: failed to close database connection', err.message);
            }
        });
    };

    try {
        const queries = [
            "SELECT DISTINCT pensioner_state as state FROM doppw_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''",
            "SELECT DISTINCT bank_state as state FROM bank_pensioner_data WHERE bank_state IS NOT NULL AND bank_state != 'nan' AND bank_state != ''",
            "SELECT DISTINCT pensioner_state as state FROM ubi3_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''",
            "SELECT DISTINCT pensioner_state as state FROM ubi1_pensioner_data WHERE pensioner_state IS NOT NULL AND pensioner_state != 'nan' AND pensioner_state != ''"
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

        const uniqueStates = [...new Set(allStates.flat())]
            .filter(state => state && state.trim() !== '')
            .sort();

        return uniqueStates;

    } finally {
        closeDb();
    }
}

module.exports = {
    getStateGeographicAnalysis,
    getAllAvailableStates
};