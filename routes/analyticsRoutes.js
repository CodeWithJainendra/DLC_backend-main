const express = require('express');
const router = express.Router();
const { database } = require('../config/database');

/**
 * @route GET /api/analytics/hierarchical-data
 * @desc Get hierarchical data: State → District → Pincode with all filters
 * @query state, gcode, escroll_cat, age_group
 * @access Public
 */
router.get('/hierarchical-data', (req, res) => {
  try {
    const { state, gcode, escroll_cat, age_group } = req.query;
    
    let whereConditions = ['gcode IS NOT NULL AND gcode != ""'];
    const params = [];
    
    // Apply filters
    if (state) {
      whereConditions.push('UPPER(state) = UPPER(?)');
      params.push(state);
    }
    
    if (gcode) {
      whereConditions.push('UPPER(gcode) = UPPER(?)');
      params.push(gcode);
    }
    
    if (escroll_cat) {
      whereConditions.push('UPPER(escroll_cat) = UPPER(?)');
      params.push(escroll_cat);
    }
    
    // Age group filter
    if (age_group) {
      const currentYear = new Date().getFullYear();
      let ageCondition = '';
      
      switch(age_group) {
        case 'below_60':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) < 60`;
          break;
        case '60_70':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 60 AND 70`;
          break;
        case '70_80':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 70 AND 80`;
          break;
        case '80_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 80 AND 90`;
          break;
        case 'above_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) > 90`;
          break;
      }
      
      if (ageCondition) {
        whereConditions.push(`birth_year IS NOT NULL AND birth_year != '' AND ${ageCondition}`);
      }
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Query for hierarchical data
    const query = `
      SELECT 
        state,
        pensioner_distname as district,
        pensioner_postcode as pincode,
        gcode,
        escroll_cat,
        COUNT(*) as count,
        AVG(CAST(${new Date().getFullYear()} - CAST(birth_year AS INTEGER) AS INTEGER)) as avg_age
      FROM pensioner_bank_master
      WHERE ${whereClause}
      GROUP BY state, pensioner_distname, pensioner_postcode, gcode, escroll_cat
      ORDER BY state, pensioner_distname, pensioner_postcode
    `;
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching hierarchical data:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Error fetching hierarchical data',
          error: err.message
        });
      }
      
      // Structure data hierarchically
      const hierarchicalData = {};
      
      rows.forEach(row => {
        if (!hierarchicalData[row.state]) {
          hierarchicalData[row.state] = {
            state: row.state,
            total: 0,
            districts: {}
          };
        }
        
        if (!hierarchicalData[row.state].districts[row.district]) {
          hierarchicalData[row.state].districts[row.district] = {
            district: row.district,
            total: 0,
            pincodes: {}
          };
        }
        
        if (!hierarchicalData[row.state].districts[row.district].pincodes[row.pincode]) {
          hierarchicalData[row.state].districts[row.district].pincodes[row.pincode] = {
            pincode: row.pincode,
            total: 0,
            categories: {}
          };
        }
        
        const categoryKey = `${row.gcode}_${row.escroll_cat}`;
        hierarchicalData[row.state].districts[row.district].pincodes[row.pincode].categories[categoryKey] = {
          gcode: row.gcode,
          escroll_cat: row.escroll_cat,
          count: row.count,
          avg_age: Math.round(row.avg_age)
        };
        
        hierarchicalData[row.state].districts[row.district].pincodes[row.pincode].total += row.count;
        hierarchicalData[row.state].districts[row.district].total += row.count;
        hierarchicalData[row.state].total += row.count;
      });
      
      res.json({
        success: true,
        filters_applied: { state, gcode, escroll_cat, age_group },
        data: hierarchicalData
      });
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route GET /api/analytics/state-wise-breakdown
 * @desc Get state-wise breakdown with category filters
 * @query gcode, escroll_cat, age_group
 * @access Public
 */
router.get('/state-wise-breakdown', (req, res) => {
  try {
    const { gcode, escroll_cat, age_group } = req.query;
    
    let whereConditions = ['gcode IS NOT NULL AND gcode != ""', 'state IS NOT NULL AND state != ""'];
    const params = [];
    
    if (gcode) {
      whereConditions.push('UPPER(gcode) = UPPER(?)');
      params.push(gcode);
    }
    
    if (escroll_cat) {
      whereConditions.push('UPPER(escroll_cat) = UPPER(?)');
      params.push(escroll_cat);
    }
    
    // Age filter
    if (age_group) {
      const currentYear = new Date().getFullYear();
      let ageCondition = '';
      
      switch(age_group) {
        case 'below_60':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) < 60`;
          break;
        case '60_70':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 60 AND 70`;
          break;
        case '70_80':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 70 AND 80`;
          break;
        case '80_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 80 AND 90`;
          break;
        case 'above_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) > 90`;
          break;
      }
      
      if (ageCondition) {
        whereConditions.push(`birth_year IS NOT NULL AND birth_year != '' AND ${ageCondition}`);
      }
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT 
        state,
        gcode,
        escroll_cat,
        COUNT(*) as count,
        COUNT(DISTINCT pensioner_distname) as districts_count,
        COUNT(DISTINCT pensioner_postcode) as pincodes_count,
        AVG(CAST(${new Date().getFullYear()} - CAST(birth_year AS INTEGER) AS INTEGER)) as avg_age,
        MIN(CAST(birth_year AS INTEGER)) as oldest_birth_year,
        MAX(CAST(birth_year AS INTEGER)) as youngest_birth_year
      FROM pensioner_bank_master
      WHERE ${whereClause}
      GROUP BY state, gcode, escroll_cat
      ORDER BY state, count DESC
    `;
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching state-wise breakdown:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Error fetching state-wise breakdown',
          error: err.message
        });
      }
      
      // Group by state
      const stateData = {};
      let grandTotal = 0;
      
      rows.forEach(row => {
        if (!stateData[row.state]) {
          stateData[row.state] = {
            state: row.state,
            total_pensioners: 0,
            total_districts: 0,
            total_pincodes: 0,
            categories: {}
          };
        }
        
        const categoryKey = `${row.gcode}_${row.escroll_cat}`;
        stateData[row.state].categories[categoryKey] = {
          gcode: row.gcode,
          escroll_cat: row.escroll_cat,
          count: row.count,
          districts_count: row.districts_count,
          pincodes_count: row.pincodes_count,
          avg_age: Math.round(row.avg_age || 0),
          age_range: `${new Date().getFullYear() - row.youngest_birth_year} - ${new Date().getFullYear() - row.oldest_birth_year}`
        };
        
        stateData[row.state].total_pensioners += row.count;
        stateData[row.state].total_districts = Math.max(stateData[row.state].total_districts, row.districts_count);
        stateData[row.state].total_pincodes = Math.max(stateData[row.state].total_pincodes, row.pincodes_count);
        grandTotal += row.count;
      });
      
      res.json({
        success: true,
        filters_applied: { gcode, escroll_cat, age_group },
        summary: {
          total_states: Object.keys(stateData).length,
          total_pensioners: grandTotal
        },
        data: Object.values(stateData)
      });
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route GET /api/analytics/category-wise-breakdown
 * @desc Get category-wise breakdown with state and age filters
 * @query state, age_group
 * @access Public
 */
router.get('/category-wise-breakdown', (req, res) => {
  try {
    const { state, age_group } = req.query;
    
    let whereConditions = ['gcode IS NOT NULL AND gcode != ""'];
    const params = [];
    
    if (state) {
      whereConditions.push('UPPER(state) = UPPER(?)');
      params.push(state);
    }
    
    // Age filter
    if (age_group) {
      const currentYear = new Date().getFullYear();
      let ageCondition = '';
      
      switch(age_group) {
        case 'below_60':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) < 60`;
          break;
        case '60_70':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 60 AND 70`;
          break;
        case '70_80':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 70 AND 80`;
          break;
        case '80_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 80 AND 90`;
          break;
        case 'above_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) > 90`;
          break;
      }
      
      if (ageCondition) {
        whereConditions.push(`birth_year IS NOT NULL AND birth_year != '' AND ${ageCondition}`);
      }
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT 
        gcode,
        escroll_cat,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT pensioner_distname) as districts_count,
        COUNT(DISTINCT pensioner_postcode) as pincodes_count,
        AVG(CAST(${new Date().getFullYear()} - CAST(birth_year AS INTEGER) AS INTEGER)) as avg_age
      FROM pensioner_bank_master
      WHERE ${whereClause}
      GROUP BY gcode, escroll_cat
      ORDER BY gcode, count DESC
    `;
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching category-wise breakdown:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Error fetching category-wise breakdown',
          error: err.message
        });
      }
      
      // Group by GCODE
      const gcodeData = {};
      let grandTotal = 0;
      
      rows.forEach(row => {
        if (!gcodeData[row.gcode]) {
          gcodeData[row.gcode] = {
            gcode: row.gcode,
            total: 0,
            subcategories: []
          };
        }
        
        gcodeData[row.gcode].subcategories.push({
          escroll_cat: row.escroll_cat,
          count: row.count,
          states_count: row.states_count,
          districts_count: row.districts_count,
          pincodes_count: row.pincodes_count,
          avg_age: Math.round(row.avg_age || 0)
        });
        
        gcodeData[row.gcode].total += row.count;
        grandTotal += row.count;
      });
      
      res.json({
        success: true,
        filters_applied: { state, age_group },
        summary: {
          total_categories: Object.keys(gcodeData).length,
          total_pensioners: grandTotal
        },
        data: Object.values(gcodeData)
      });
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route GET /api/analytics/age-distribution
 * @desc Get age distribution with state and category filters
 * @query state, gcode, escroll_cat
 * @access Public
 */
router.get('/age-distribution', (req, res) => {
  try {
    const { state, gcode, escroll_cat } = req.query;
    
    let whereConditions = [
      'gcode IS NOT NULL AND gcode != ""',
      'birth_year IS NOT NULL AND birth_year != ""',
      'CAST(birth_year AS INTEGER) > 1900'
    ];
    const params = [];
    
    if (state) {
      whereConditions.push('UPPER(state) = UPPER(?)');
      params.push(state);
    }
    
    if (gcode) {
      whereConditions.push('UPPER(gcode) = UPPER(?)');
      params.push(gcode);
    }
    
    if (escroll_cat) {
      whereConditions.push('UPPER(escroll_cat) = UPPER(?)');
      params.push(escroll_cat);
    }
    
    const whereClause = whereConditions.join(' AND ');
    const currentYear = new Date().getFullYear();
    
    const query = `
      SELECT 
        CASE 
          WHEN (${currentYear} - CAST(birth_year AS INTEGER)) < 60 THEN 'below_60'
          WHEN (${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 60 AND 70 THEN '60_70'
          WHEN (${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 70 AND 80 THEN '70_80'
          WHEN (${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 80 AND 90 THEN '80_90'
          ELSE 'above_90'
        END as age_group,
        COUNT(*) as count,
        COUNT(DISTINCT state) as states_count,
        COUNT(DISTINCT gcode) as gcode_count,
        COUNT(DISTINCT escroll_cat) as escroll_cat_count
      FROM pensioner_bank_master
      WHERE ${whereClause}
      GROUP BY age_group
      ORDER BY 
        CASE age_group
          WHEN 'below_60' THEN 1
          WHEN '60_70' THEN 2
          WHEN '70_80' THEN 3
          WHEN '80_90' THEN 4
          WHEN 'above_90' THEN 5
        END
    `;
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching age distribution:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Error fetching age distribution',
          error: err.message
        });
      }
      
      const totalPensioners = rows.reduce((sum, row) => sum + row.count, 0);
      
      const distribution = rows.map(row => ({
        age_group: row.age_group,
        age_label: {
          'below_60': 'Below 60 years',
          '60_70': '60-70 years',
          '70_80': '70-80 years',
          '80_90': '80-90 years',
          'above_90': 'Above 90 years'
        }[row.age_group],
        count: row.count,
        percentage: ((row.count / totalPensioners) * 100).toFixed(2),
        states_count: row.states_count,
        gcode_count: row.gcode_count,
        escroll_cat_count: row.escroll_cat_count
      }));
      
      res.json({
        success: true,
        filters_applied: { state, gcode, escroll_cat },
        summary: {
          total_pensioners: totalPensioners
        },
        data: distribution
      });
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route GET /api/analytics/combined-filters
 * @desc Get comprehensive data with all possible filter combinations
 * @query state, district, pincode, gcode, escroll_cat, age_group
 * @access Public
 */
router.get('/combined-filters', (req, res) => {
  try {
    const { state, district, pincode, gcode, escroll_cat, age_group } = req.query;
    
    let whereConditions = ['gcode IS NOT NULL AND gcode != ""'];
    const params = [];
    
    // Apply all filters
    if (state) {
      whereConditions.push('UPPER(state) = UPPER(?)');
      params.push(state);
    }
    
    if (district) {
      whereConditions.push('UPPER(pensioner_distname) = UPPER(?)');
      params.push(district);
    }
    
    if (pincode) {
      whereConditions.push('pensioner_postcode = ?');
      params.push(pincode);
    }
    
    if (gcode) {
      whereConditions.push('UPPER(gcode) = UPPER(?)');
      params.push(gcode);
    }
    
    if (escroll_cat) {
      whereConditions.push('UPPER(escroll_cat) = UPPER(?)');
      params.push(escroll_cat);
    }
    
    // Age filter
    if (age_group) {
      const currentYear = new Date().getFullYear();
      let ageCondition = '';
      
      switch(age_group) {
        case 'below_60':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) < 60`;
          break;
        case '60_70':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 60 AND 70`;
          break;
        case '70_80':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 70 AND 80`;
          break;
        case '80_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) BETWEEN 80 AND 90`;
          break;
        case 'above_90':
          ageCondition = `(${currentYear} - CAST(birth_year AS INTEGER)) > 90`;
          break;
      }
      
      if (ageCondition) {
        whereConditions.push(`birth_year IS NOT NULL AND birth_year != '' AND ${ageCondition}`);
      }
    }
    
    const whereClause = whereConditions.join(' AND ');
    const currentYear = new Date().getFullYear();
    
    // Comprehensive query
    const query = `
      SELECT 
        state,
        pensioner_distname as district,
        pensioner_postcode as pincode,
        gcode,
        escroll_cat,
        COUNT(*) as count,
        AVG(CAST(${currentYear} - CAST(birth_year AS INTEGER) AS INTEGER)) as avg_age,
        MIN(CAST(birth_year AS INTEGER)) as oldest_birth_year,
        MAX(CAST(birth_year AS INTEGER)) as youngest_birth_year,
        COUNT(DISTINCT branch_name) as branches_count
      FROM pensioner_bank_master
      WHERE ${whereClause}
      GROUP BY state, pensioner_distname, pensioner_postcode, gcode, escroll_cat
      ORDER BY count DESC
      LIMIT 1000
    `;
    
    database.getDB().all(query, params, (err, rows) => {
      if (err) {
        console.error('Error fetching combined filter data:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Error fetching data',
          error: err.message
        });
      }
      
      const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
      
      const formattedData = rows.map(row => ({
        state: row.state,
        district: row.district,
        pincode: row.pincode,
        gcode: row.gcode,
        escroll_cat: row.escroll_cat,
        count: row.count,
        avg_age: Math.round(row.avg_age || 0),
        age_range: `${currentYear - row.youngest_birth_year} - ${currentYear - row.oldest_birth_year} years`,
        branches_count: row.branches_count
      }));
      
      res.json({
        success: true,
        filters_applied: {
          state,
          district,
          pincode,
          gcode,
          escroll_cat,
          age_group
        },
        summary: {
          total_records: formattedData.length,
          total_pensioners: totalCount,
          unique_states: [...new Set(formattedData.map(d => d.state))].length,
          unique_districts: [...new Set(formattedData.map(d => d.district))].length,
          unique_pincodes: [...new Set(formattedData.map(d => d.pincode))].length
        },
        data: formattedData
      });
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
