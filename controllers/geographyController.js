const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Multiple database paths
const DB_PATH_1 = path.join(__dirname, '..', 'database.db');
const DB_PATH_2 = path.join(__dirname, '..', 'DLCServer', 'database.db');
const DB_PATH_3 = path.join(__dirname, '..', 'DLCServer', 'Insertexceldata', 'dlc_portal_database.db');

// Lazy database connections
let db1, db2, db3;

function getDb1() {
  if (!db1 && fs.existsSync(DB_PATH_1)) {
    db1 = new Database(DB_PATH_1, { readonly: true });
  }
  return db1;
}

function getDb2() {
  if (!db2 && fs.existsSync(DB_PATH_2)) {
    db2 = new Database(DB_PATH_2, { readonly: true });
  }
  return db2;
}

function getDb3() {
  if (!db3 && fs.existsSync(DB_PATH_3)) {
    db3 = new Database(DB_PATH_3, { readonly: true });
  }
  return db3;
}

class GeographyController {
  /**
   * Get comprehensive state-wise pensioner statistics from ALL databases
   * Endpoint: GET /api/pension/geography/states
   * Returns: Total pensioners, DLC counts, age categories, districts, pincodes per state
   */
  static async getComprehensiveStats(req, res) {
    try {
      console.log('Fetching comprehensive state-wise data from all databases...');
      
      // Initialize aggregated data structure
      const stateDataMap = new Map();
      let grandTotalPensioners = 0;
      let grandTotalDLC = 0;
      let totalStates = 0;
      let totalDistricts = 0;
      let totalPincodes = 0;

      // ============================================
      // DATABASE 1: database.db - DOPPW Data
      // ============================================
      console.log('Processing Database 1: database.db');
      
      try {
        const doppwStateQuery = `
          SELECT 
            BRANCH_STATE_NAME as state,
            AGE as age,
            SUBMISSION_MODE as mode,
            COUNT(*) as count
          FROM TBL_DOPPW_DLCDATA_MST
          WHERE BRANCH_STATE_NAME IS NOT NULL 
            AND BRANCH_STATE_NAME != 'nan'
            AND BRANCH_STATE_NAME != ''
          GROUP BY BRANCH_STATE_NAME, AGE, SUBMISSION_MODE
        `;
        
        const database1 = getDb1();
        const doppwStates = database1 ? database1.prepare(doppwStateQuery).all() : [];
        
        for (const row of doppwStates) {
          if (!row.state) continue;
          
          const stateName = row.state.trim().toUpperCase();
          const age = row.age || 0;
          const count = row.count || 0;
          const isDLC = row.mode === 'DLC';
          
          // Determine age category
          let ageCategory = '90+';
          if (age >= 50 && age < 60) ageCategory = '50-60';
          else if (age >= 60 && age < 70) ageCategory = '60-70';
          else if (age >= 70 && age < 80) ageCategory = '70-80';
          else if (age >= 80 && age < 90) ageCategory = '80-90';
          
          if (!stateDataMap.has(stateName)) {
            stateDataMap.set(stateName, {
              state: stateName,
              totalPensioners: 0,
              totalDLC: 0,
              districts: new Set(),
              pincodes: new Set(),
              ageCategories: {
                '50-60': 0,
                '60-70': 0,
                '70-80': 0,
                '80-90': 0,
                '90+': 0
              }
            });
          }
          
          const stateData = stateDataMap.get(stateName);
          stateData.totalPensioners += count;
          if (isDLC) stateData.totalDLC += count;
          if (age >= 50) {
            stateData.ageCategories[ageCategory] += count;
          }
          grandTotalPensioners += count;
          if (isDLC) grandTotalDLC += count;
        }
        
        console.log(`DB1: Processed ${doppwStates.length} records from DOPPW data`);
        
        // Get district and pincode counts separately for efficiency
        const geoQuery = `
          SELECT 
            BRANCH_STATE_NAME as state,
            COUNT(DISTINCT PENSIONER_DISTRICT_NAME) as districts,
            COUNT(DISTINCT BRANCH_PINCODE) as pincodes
          FROM TBL_DOPPW_DLCDATA_MST
          WHERE BRANCH_STATE_NAME IS NOT NULL 
            AND BRANCH_STATE_NAME != 'nan'
            AND BRANCH_STATE_NAME != ''
          GROUP BY BRANCH_STATE_NAME
        `;
        
        const geoData = database1 ? database1.prepare(geoQuery).all() : [];
        for (const row of geoData) {
          if (!row.state) continue;
          const stateName = row.state.trim().toUpperCase();
          if (stateDataMap.has(stateName)) {
            const stateData = stateDataMap.get(stateName);
            // Add districts and pincodes to sets (will be counted later)
            for (let i = 0; i < row.districts; i++) {
              stateData.districts.add(`${stateName}_dist_${i}`);
            }
            for (let i = 0; i < row.pincodes; i++) {
              stateData.pincodes.add(`${stateName}_pin_${i}`);
            }
          }
        }
        
        console.log(`DB1: Processed geographical data for ${geoData.length} states`);
      } catch (error) {
        console.error('Error processing DB1 DOPPW data:', error.message);
      }

      // ============================================
      // DATABASE 2: DLCServer/database.db - Main Pensioner Data
      // ============================================
      console.log('Processing Database 2: DLCServer/database.db');
      
      // Process pincode_master for geographical data
      try {
        const pincodeQuery = `
          SELECT 
            state,
            district,
            pincode,
            COUNT(*) as count
          FROM pincode_master
          WHERE state IS NOT NULL AND state != ''
          GROUP BY state, district, pincode
        `;
        
        const database2 = getDb2();
        const pincodeData = database2 ? database2.prepare(pincodeQuery).all() : [];
        
        for (const row of pincodeData) {
          if (!row.state) continue;
          const stateName = row.state.trim().toUpperCase();
          if (!stateDataMap.has(stateName)) {
            stateDataMap.set(stateName, {
              state: stateName,
              totalPensioners: 0,
              totalDLC: 0,
              districts: new Set(),
              pincodes: new Set(),
              ageCategories: {
                '50-60': 0,
                '60-70': 0,
                '70-80': 0,
                '80-90': 0,
                '90+': 0
              }
            });
          }
          
          const stateData = stateDataMap.get(stateName);
          if (row.district) stateData.districts.add(row.district.trim());
          if (row.pincode) stateData.pincodes.add(row.pincode.toString().trim());
        }
        
        console.log(`DB2: Processed ${pincodeData.length} pincode records`);
      } catch (error) {
        console.error('Error processing DB2 pincode data:', error.message);
      }

      // Process doppw_pensioner_data for age categories
      try {
        const doppwPensionerQuery = `
          SELECT 
            branch_state as state,
            age,
            COUNT(*) as count
          FROM doppw_pensioner_data
          WHERE branch_state IS NOT NULL AND branch_state != ''
          GROUP BY branch_state, age
        `;
        
        const doppwPensioners = database2 ? database2.prepare(doppwPensionerQuery).all() : [];
        
        for (const row of doppwPensioners) {
          if (!row.state) continue;
          
          const stateName = row.state.trim().toUpperCase();
          const age = row.age || 0;
          const count = row.count || 0;
          
          // Determine age category
          let ageCategory = '90+';
          if (age >= 50 && age < 60) ageCategory = '50-60';
          else if (age >= 60 && age < 70) ageCategory = '60-70';
          else if (age >= 70 && age < 80) ageCategory = '70-80';
          else if (age >= 80 && age < 90) ageCategory = '80-90';
          
          if (!stateDataMap.has(stateName)) {
            stateDataMap.set(stateName, {
              state: stateName,
              totalPensioners: 0,
              totalDLC: 0,
              districts: new Set(),
              pincodes: new Set(),
              ageCategories: {
                '50-60': 0,
                '60-70': 0,
                '70-80': 0,
                '80-90': 0,
                '90+': 0
              }
            });
          }
          
          const stateData = stateDataMap.get(stateName);
          if (age >= 50) {
            stateData.ageCategories[ageCategory] += count;
          }
          // Don't add to totalPensioners here - already counted in pensioner_pincode_data
        }
        
        console.log(`DB2: Processed ${doppwPensioners.length} age records from doppw_pensioner_data`);
      } catch (error) {
        console.error('Error processing DB2 age categories:', error.message);
      }

      // Process pensioner_pincode_data for additional counts
      try {
        const pincodeCountQuery = `
          SELECT 
            state,
            COUNT(*) as count
          FROM pensioner_pincode_data
          WHERE state IS NOT NULL AND state != ''
          GROUP BY state
        `;
        
        const pincodeCounts = database2 ? database2.prepare(pincodeCountQuery).all() : [];
        
        for (const row of pincodeCounts) {
          if (!row.state) continue;
          const stateName = row.state.trim().toUpperCase();
          if (stateDataMap.has(stateName)) {
            const stateData = stateDataMap.get(stateName);
            stateData.totalPensioners += row.count || 0;
            grandTotalPensioners += row.count || 0;
          }
        }
        
        console.log(`DB2: Processed ${pincodeCounts.length} states from pincode data`);
      } catch (error) {
        console.error('Error processing DB2 pincode counts:', error.message);
      }

      // ============================================
      // DATABASE 3: dlc_portal_database.db
      // ============================================
      console.log('Processing Database 3: dlc_portal_database.db');
      
      try {
        const portalQuery = `
          SELECT 
            psa_area as state,
            age_category,
            COUNT(*) as count
          FROM dlc_pensioner_data
          WHERE psa_area IS NOT NULL AND psa_area != ''
          GROUP BY psa_area, age_category
        `;
        
        const database3 = getDb3();
        const portalData = database3 ? database3.prepare(portalQuery).all() : [];
        
        for (const row of portalData) {
          if (!row.state) continue;
          const stateName = row.state.trim().toUpperCase();
          if (!stateDataMap.has(stateName)) {
            stateDataMap.set(stateName, {
              state: stateName,
              totalPensioners: 0,
              totalDLC: 0,
              districts: new Set(),
              pincodes: new Set(),
              ageCategories: {
                '50-60': 0,
                '60-70': 0,
                '70-80': 0,
                '80-90': 0,
                '90+': 0
              }
            });
          }
          
          const stateData = stateDataMap.get(stateName);
          const ageCategory = row.age_category || 'Unknown';
          if (stateData.ageCategories[ageCategory] !== undefined) {
            stateData.ageCategories[ageCategory] += row.count || 0;
          }
          stateData.totalPensioners += row.count || 0;
          grandTotalPensioners += row.count || 0;
        }
        
        console.log(`DB3: Processed ${portalData.length} portal records`);
      } catch (error) {
        console.error('Error processing DB3 portal data:', error.message);
      }

      // ============================================
      // AGGREGATE AND SORT RESULTS
      // ============================================
      
      // Convert Map to Array and calculate totals
      const statesArray = Array.from(stateDataMap.values()).map(state => ({
        state: state.state,
        totalPensioners: state.totalPensioners,
        totalDLC: state.totalDLC,
        totalDistricts: state.districts.size,
        totalPincodes: state.pincodes.size,
        ageCategories: state.ageCategories,
        dlcPercentage: state.totalPensioners > 0 
          ? ((state.totalDLC / state.totalPensioners) * 100).toFixed(2) 
          : '0.00'
      }));
      
      // Sort by total pensioners (highest to lowest)
      statesArray.sort((a, b) => b.totalPensioners - a.totalPensioners);
      
      // Calculate totals
      totalStates = statesArray.length;
      totalDistricts = statesArray.reduce((sum, state) => sum + state.totalDistricts, 0);
      totalPincodes = statesArray.reduce((sum, state) => sum + state.totalPincodes, 0);
      
      console.log(`Total States: ${totalStates}, Total Pensioners: ${grandTotalPensioners}`);

      // Response
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          totalPensioners: grandTotalPensioners,
          totalDLC: grandTotalDLC,
          totalStates: totalStates,
          totalDistricts: totalDistricts,
          totalPincodes: totalPincodes,
          dlcPercentage: grandTotalPensioners > 0 
            ? ((grandTotalDLC / grandTotalPensioners) * 100).toFixed(2) 
            : '0.00'
        },
        states: statesArray,
        metadata: {
          databases_processed: 3,
          query_time: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error in getComprehensiveStats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comprehensive statistics',
        error: error.message
      });
    }
  }

  /**
   * Get states list (existing functionality)
   */
  static async getStatesList(req, res) {
    try {
      // Get states from DOPPW table
      const statesQuery = `
        SELECT 
          BRANCH_STATE_NAME as state,
          COUNT(*) as pensioner_count
        FROM TBL_DOPPW_DLCDATA_MST
        WHERE BRANCH_STATE_NAME IS NOT NULL AND BRANCH_STATE_NAME != 'nan'
        GROUP BY BRANCH_STATE_NAME
        ORDER BY pensioner_count DESC
      `;
      
      const states = db.prepare(statesQuery).all();

      res.json({
        success: true,
        count: states.length,
        states: states.map(s => ({
          name: s.state,
          pensioners: s.pensioner_count
        }))
      });

    } catch (error) {
      console.error('Error in getStatesList:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch states list',
        error: error.message
      });
    }
  }

  /**
   * Get cities by state
   */
  static async getCitiesByState(req, res) {
    try {
      const { state } = req.params;

      const citiesQuery = `
        SELECT 
          PENSIONER_DISTRICT_NAME as city,
          COUNT(*) as pensioner_count
        FROM TBL_DOPPW_DLCDATA_MST
        WHERE BRANCH_STATE_NAME = ?
          AND PENSIONER_DISTRICT_NAME IS NOT NULL 
          AND PENSIONER_DISTRICT_NAME != 'nan'
        GROUP BY PENSIONER_DISTRICT_NAME
        ORDER BY pensioner_count DESC
      `;
      
      const cities = db.prepare(citiesQuery).all(state);

      res.json({
        success: true,
        state: state,
        count: cities.length,
        cities: cities.map(c => ({
          name: c.city,
          pensioners: c.pensioner_count
        }))
      });

    } catch (error) {
      console.error('Error in getCitiesByState:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cities',
        error: error.message
      });
    }
  }
}

module.exports = GeographyController;
