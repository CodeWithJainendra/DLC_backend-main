const express = require('express');
const router = express.Router();
const { database } = require('../config/database');

/**
 * @route GET /api/doppw/stats
 * @desc Get DOPPW data statistics from pensioner_bank_master
 * @access Public
 */
router.get('/stats', (req, res) => {
  try {
    const db = database.getDB();
    
    // Get overall statistics
    const queries = {
      total: `SELECT COUNT(*) as count FROM pensioner_bank_master WHERE gcode IS NOT NULL AND gcode != ''`,
      byState: `
        SELECT state, COUNT(*) as count 
        FROM pensioner_bank_master 
        WHERE gcode IS NOT NULL AND gcode != '' AND state IS NOT NULL AND state != ''
        GROUP BY state 
        ORDER BY count DESC
      `,
      byGcode: `
        SELECT gcode, COUNT(*) as count 
        FROM pensioner_bank_master 
        WHERE gcode IS NOT NULL AND gcode != ''
        GROUP BY gcode 
        ORDER BY count DESC
      `,
      byVerificationType: `
        SELECT verification_type, COUNT(*) as count 
        FROM pensioner_bank_master 
        WHERE gcode IS NOT NULL AND gcode != '' AND verification_type IS NOT NULL AND verification_type != ''
        GROUP BY verification_type 
        ORDER BY count DESC
      `,
      bySubmissionStatus: `
        SELECT submitted_status, COUNT(*) as count 
        FROM pensioner_bank_master 
        WHERE gcode IS NOT NULL AND gcode != '' AND submitted_status IS NOT NULL AND submitted_status != ''
        GROUP BY submitted_status 
        ORDER BY count DESC
      `
    };
    
    const results = {};
    let completedQueries = 0;
    const totalQueries = Object.keys(queries).length;
    
    Object.entries(queries).forEach(([key, query]) => {
      db.all(query, [], (err, rows) => {
        if (err) {
          console.error(`Error in ${key} query:`, err.message);
          results[key] = [];
        } else {
          results[key] = rows || [];
        }
        
        completedQueries++;
        if (completedQueries === totalQueries) {
          res.json({
            success: true,
            data: {
              total_records: results.total[0]?.count || 0,
              state_distribution: results.byState,
              gcode_distribution: results.byGcode,
              verification_type_distribution: results.byVerificationType,
              submission_status_distribution: results.bySubmissionStatus,
              timestamp: new Date().toISOString()
            }
          });
        }
      });
    });
    
  } catch (error) {
    console.error('Error fetching DOPPW stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching DOPPW statistics',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/records
 * @desc Get DOPPW records with comprehensive filtering
 * @access Public
 */
router.get('/records', (req, res) => {
  try {
    const { 
      state, 
      gcode, 
      verification_type, 
      escroll_cat,
      pension_type,
      submitted_status,
      branch_state,
      limit = 100,
      page = 1
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT 
        gcode, escroll_cat, gid, pension_type, branch_code, branch_name,
        branch_pin, branch_state, birth_year, submitted_status, waiver_upto,
        submission_mode, verification_type, certificate_submission_date,
        pensioner_postcode, pensioner_distname, state, ppo_number,
        data_source, sheet_name, created_at
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != ''
    `;
    
    const params = [];
    
    if (state) {
      query += ` AND UPPER(state) = UPPER(?)`;
      params.push(state);
    }
    
    if (gcode) {
      query += ` AND UPPER(gcode) = UPPER(?)`;
      params.push(gcode);
    }
    
    if (verification_type) {
      query += ` AND UPPER(verification_type) = UPPER(?)`;
      params.push(verification_type);
    }
    
    if (escroll_cat) {
      query += ` AND UPPER(escroll_cat) = UPPER(?)`;
      params.push(escroll_cat);
    }
    
    if (pension_type) {
      query += ` AND UPPER(pension_type) = UPPER(?)`;
      params.push(pension_type);
    }
    
    if (submitted_status) {
      query += ` AND UPPER(submitted_status) = UPPER(?)`;
      params.push(submitted_status);
    }
    
    if (branch_state) {
      query += ` AND UPPER(branch_state) = UPPER(?)`;
      params.push(branch_state);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching DOPPW records:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching DOPPW records',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            records: rows || [],
            total_records: rows ? rows.length : 0,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              offset: offset
            },
            filters_applied: { 
              state, 
              gcode, 
              verification_type, 
              escroll_cat,
              pension_type,
              submitted_status,
              branch_state
            }
          },
          timestamp: new Date().toISOString()
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching DOPPW records:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching DOPPW records',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/states
 * @desc Get available states in DOPPW data
 * @access Public
 */
router.get('/states', (req, res) => {
  try {
    const query = `
      SELECT DISTINCT state, COUNT(*) as count
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != '' AND state IS NOT NULL AND state != ''
      GROUP BY state 
      ORDER BY state
    `;
    
    database.getDB().all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching DOPPW states:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching DOPPW states',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            states: rows || [],
            total_states: rows ? rows.length : 0
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching DOPPW states:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching DOPPW states',
      error: error.message
    });
  }
});

/**
 * @route POST /api/doppw/populate-dlc-data
 * @desc Populate TBL_DOPPW_DLCDATA_MST from DOPPW data
 * @access Public
 */
router.post('/populate-dlc-data', async (req, res) => {
  try {
    const DLCDataPopulator = require('../scripts/populateDLCData');
    const populator = new DLCDataPopulator();
    
    const result = await populator.execute();
    
    res.json({
      success: true,
      message: 'DLC data populated successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error populating DLC data:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error populating DLC data',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/verification-types
 * @desc Get all verification types with counts
 * @access Public
 */
router.get('/verification-types', (req, res) => {
  try {
    const query = `
      SELECT 
        verification_type,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT gcode) as gcode_count
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != ''
        AND verification_type IS NOT NULL AND verification_type != ''
      GROUP BY verification_type 
      ORDER BY count DESC
    `;
    
    database.getDB().all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching verification types:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching verification types',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            verification_types: rows || [],
            total_types: rows ? rows.length : 0
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching verification types:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching verification types',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/gcodes
 * @desc Get all GCODE categories with statistics
 * @access Public
 */
router.get('/gcodes', (req, res) => {
  try {
    const query = `
      SELECT 
        gcode,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT escroll_cat) as escroll_categories
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != ''
      GROUP BY gcode 
      ORDER BY count DESC
    `;
    
    database.getDB().all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching GCODE list:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching GCODE list',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            gcodes: rows || [],
            total_gcodes: rows ? rows.length : 0
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching GCODE list:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching GCODE list',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/escroll-categories
 * @desc Get all escroll categories with statistics
 * @access Public
 */
router.get('/escroll-categories', (req, res) => {
  try {
    const query = `
      SELECT 
        escroll_cat,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT gcode) as gcode_count
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != ''
        AND escroll_cat IS NOT NULL AND escroll_cat != ''
      GROUP BY escroll_cat 
      ORDER BY count DESC
    `;
    
    database.getDB().all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching escroll categories:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching escroll categories',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            escroll_categories: rows || [],
            total_categories: rows ? rows.length : 0
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching escroll categories:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching escroll categories',
      error: error.message
    });
  }
});

/**
 * @route GET /api/doppw/submission-status
 * @desc Get all submission statuses with statistics
 * @access Public
 */
router.get('/submission-status', (req, res) => {
  try {
    const query = `
      SELECT 
        submitted_status,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT verification_type) as verification_types_count
      FROM pensioner_bank_master 
      WHERE gcode IS NOT NULL AND gcode != ''
        AND submitted_status IS NOT NULL AND submitted_status != ''
      GROUP BY submitted_status 
      ORDER BY count DESC
    `;
    
    database.getDB().all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching submission statuses:', err.message);
        res.status(500).json({
          success: false,
          message: 'Error fetching submission statuses',
          error: err.message
        });
      } else {
        res.json({
          success: true,
          data: {
            submission_statuses: rows || [],
            total_statuses: rows ? rows.length : 0
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Error fetching submission statuses:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching submission statuses',
      error: error.message
    });
  }
});

module.exports = router;
