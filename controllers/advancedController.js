const AdvancedPensionModel = require('../models/AdvancedPensionModel');

class AdvancedController {
  
  static async getBranchDistribution(req, res) {
    try {
      const filters = {
        bankName: req.query.bank_name,
        state: req.query.state,
        limit: req.query.limit ? parseInt(req.query.limit) : null
      };

      const branches = await AdvancedPensionModel.getBranchDistribution(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_branches: branches.length,
        branches: branches.map(branch => ({
          bank_name: branch.bank_name,
          branch_name: branch.branch_name,
          branch_postcode: branch.branch_postcode,
          total_pensioners: branch.total_pensioners,
          states_served: branch.states_served,
          categories_served: branch.categories_served
        }))
      });
    } catch (error) {
      // console.error('Error fetching branch distribution:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch distribution'
      });
    }
  }

  static async getPDAStatistics(req, res) {
    try {
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name
      };

      const pdaStats = await AdvancedPensionModel.getPDAStatistics(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_pda_types: pdaStats.length,
        pda_statistics: pdaStats.map(pda => ({
          pda: pda.PDA,
          total_pensioners: pda.total_pensioners,
          banks_count: pda.banks_count,
          states_count: pda.states_count,
          categories_count: pda.categories_count
        }))
      });
    } catch (error) {
      // console.error('Error fetching PDA statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch PDA statistics'
      });
    }
  }

  static async getDataQualityReport(req, res) {
    try {
      const duplicatePPOs = await AdvancedPensionModel.getDuplicatePPOs();
      
      res.json({
        success: true,
        data_quality_report: {
          duplicate_ppo_count: duplicatePPOs.length,
          total_duplicates: duplicatePPOs.reduce((sum, item) => sum + item.duplicate_count, 0),
          duplicate_details: duplicatePPOs.slice(0, 50).map(item => ({
            ppo_number: item.ppo_number,
            duplicate_count: item.duplicate_count,
            banks_involved: item.banks.split(','),
            states_involved: item.states.split(',')
          }))
        }
      });
    } catch (error) {
      // console.error('Error generating data quality report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate data quality report'
      });
    }
  }

  static async getPostcodeCoverage(req, res) {
    try {
      const filters = {
        state: req.query.state,
        minPensioners: req.query.min_pensioners ? parseInt(req.query.min_pensioners) : null,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const coverage = await AdvancedPensionModel.getPostcodeCoverage(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        postcode_analysis: {
          total_postcodes: coverage.length,
          postcodes: coverage.map(item => ({
            postcode: item.pensioner_postcode,
            state: item.state,
            city: item.pensioner_city,
            total_pensioners: item.total_pensioners,
            banks_available: item.banks_available,
            categories_available: item.categories_available,
            bank_list: item.bank_list.split(',')
          }))
        }
      });
    } catch (error) {
      // console.error('Error fetching postcode coverage:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch postcode coverage'
      });
    }
  }

  static async getCrossTabulation(req, res) {
    try {
      const { dimension1, dimension2 } = req.params;
      const filters = {
        state: req.query.state,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const crossTab = await AdvancedPensionModel.getCrossTabulation(dimension1, dimension2, filters);
      
      res.json({
        success: true,
        analysis: {
          dimension1,
          dimension2,
          total_combinations: crossTab.length,
          cross_tabulation: crossTab
        }
      });
    } catch (error) {
      // console.error('Error generating cross-tabulation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate cross-tabulation analysis'
      });
    }
  }

  // Advanced Age Analytics
  static async getAgeCrossTabulation(req, res) {
    try {
      const { dimension } = req.params;
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const ageCrossTab = await AdvancedPensionModel.getAgeCrossTabulation(dimension, filters);
      
      // Group by dimension for better response structure
      const groupedData = {};
      ageCrossTab.forEach(item => {
        if (!groupedData[item.dimension_value]) {
          groupedData[item.dimension_value] = {
            dimension_value: item.dimension_value,
            age_distribution: {},
            total_pensioners: 0
          };
        }
        groupedData[item.dimension_value].age_distribution[item.age_category] = item.count;
        groupedData[item.dimension_value].total_pensioners += item.count;
      });

      res.json({
        success: true,
        analysis: {
          dimension,
          total_dimensions: Object.keys(groupedData).length,
          filters_applied: filters,
          cross_tabulation: Object.values(groupedData)
        }
      });
    } catch (error) {
      // console.error('Error generating age cross-tabulation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate age cross-tabulation analysis'
      });
    }
  }

  static async getAgeTrendAnalysis(req, res) {
    try {
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        category: req.query.category,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const ageTrends = await AdvancedPensionModel.getAgeTrendAnalysis(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_records: ageTrends.length,
        age_trend_analysis: ageTrends.map(trend => ({
          age_category: trend.age_category,
          state: trend.state,
          bank_name: trend.bank_name,
          psa: trend.PSA,
          count: trend.count,
          average_age: Math.round(trend.average_age * 10) / 10
        }))
      });
    } catch (error) {
      // console.error('Error generating age trend analysis:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate age trend analysis'
      });
    }
  }
}

module.exports = AdvancedController;