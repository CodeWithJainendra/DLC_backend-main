const PensionModel = require('../models/PensionModel');
const CacheController = require('./cacheController');
const { validationResult } = require('express-validator');

class PensionController {
  static async getBanksList(req, res) {
    try {
      // Check cache first
      const cacheKey = CacheController.getBanksKey();
      const cachedData = CacheController.get(cacheKey);
      
      if (cachedData) {
        // Serving banks list from cache
        return res.json({
          success: true,
          cached: true,
          banks: cachedData
        });
      }

      // Fetching banks list from database
      const banks = await PensionModel.getBanksList();
      const formattedBanks = banks.map(bank => ({
        name: bank.bank_name,
        total_pensioners: bank.total_pensioners,
        states_served: bank.states_served,
        pincodes_served: bank.pincodes_served
      }));

      // Cache the result for 10 minutes (banks don't change often)
      CacheController.set(cacheKey, formattedBanks, 600);
      
      res.json({
        success: true,
        cached: false,
        banks: formattedBanks
      });
    } catch (error) {
      // Error fetching banks list
      res.status(500).json({
        success: false,
        message: 'Failed to fetch banks list'
      });
    }
  }

  static async getPensionersByBank(req, res) {
    try {
      const { bankName } = req.params;
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 100;

      const result = await PensionModel.getPensionersByBank(bankName, page, perPage);
      
      res.json({
        success: true,
        bank: bankName,
        summary: {
          total_pensioners: result.total
        },
        pagination: {
          page,
          per_page: perPage,
          total_pages: Math.ceil(result.total / perPage),
          total_records: result.total
        },
        pensioners: result.data
      });
    } catch (error) {
      // Error fetching pensioners by bank
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pensioners by bank'
      });
    }
  }

  static async getBankStateSummary(req, res) {
    try {
      const { bank_name } = req.query;
      const data = await PensionModel.getBankStateSummary(bank_name);
      
      // Group by state
      const statesSummary = {};
      data.forEach(row => {
        if (!statesSummary[row.state]) {
          statesSummary[row.state] = {
            state: row.state,
            banks: {},
            totals: {
              total_pensioners: 0,
              pincodes_count: 0,
              cities_count: 0
            }
          };
        }
        
        statesSummary[row.state].banks[row.bank_name] = {
          total: row.total_pensioners,
          pincodes: row.pincodes_count,
          cities: row.cities_count
        };
        
        statesSummary[row.state].totals.total_pensioners += row.total_pensioners;
        statesSummary[row.state].totals.pincodes_count += row.pincodes_count;
        statesSummary[row.state].totals.cities_count += row.cities_count;
      });

      res.json({
        success: true,
        states: Object.values(statesSummary)
      });
    } catch (error) {
      // Error fetching bank state summary
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank state summary'
      });
    }
  }

  static async getCategoriesList(req, res) {
    try {
      const categories = await PensionModel.getCategoriesList();
      res.json({
        success: true,
        categories: categories.map(cat => ({
          code: cat.category_code,
          name: cat.category_name,
          total_pensioners: cat.total_pensioners,
          pensioner_postcodes_count: cat.pensioner_postcodes_count,
          bank_postcodes_count: cat.bank_postcodes_count,
          states_count: cat.states_count,
          banks_count: cat.banks_count
        }))
      });
    } catch (error) {
      // Error fetching categories list
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories list'
      });
    }
  }

  static async getPensionersByCategory(req, res) {
    try {
      const { category } = req.params;
      const filters = {
        bankName: req.query.bank_name,
        state: req.query.state,
        postcode: req.query.postcode,
        page: parseInt(req.query.page) || 1,
        perPage: parseInt(req.query.per_page) || 100
      };

      const pensioners = await PensionModel.getPensionersByCategory(category, filters);
      
      res.json({
        success: true,
        category,
        filters: {
          bank_name: filters.bankName,
          state: filters.state,
          postcode: filters.postcode
        },
        pagination: {
          page: filters.page,
          per_page: filters.perPage,
          total_records: pensioners.length
        },
        pensioners
      });
    } catch (error) {
      // Error fetching pensioners by category
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pensioners by category'
      });
    }
  }

  static async getStatesList(req, res) {
    try {
      const filters = {
        bankName: req.query.bank_name,
        category: req.query.category
      };

      const states = await PensionModel.getStatesList(filters);
      
      res.json({
        success: true,
        filters,
        states: states.map(state => ({
          state: state.state,
          total_pensioners: state.total_pensioners,
          banks_count: state.banks_count,
          pincodes_count: state.pincodes_count,
          cities_count: state.cities_count
        }))
      });
    } catch (error) {
      // Error fetching states list
      res.status(500).json({
        success: false,
        message: 'Failed to fetch states list'
      });
    }
  }

  static async getCitiesByState(req, res) {
    try {
      const { state } = req.params;
      const filters = {
        bankName: req.query.bank_name,
        category: req.query.category
      };

      const cities = await PensionModel.getCitiesByState(state, filters);
      
      res.json({
        success: true,
        state,
        filters,
        cities: cities.map(city => ({
          city: city.pensioner_city,
          total_pensioners: city.total_pensioners,
          banks_count: city.banks_count,
          pincodes_count: city.pincodes_count
        }))
      });
    } catch (error) {
      // Error fetching cities by state
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cities by state'
      });
    }
  }

  static async getPensionersByPostcode(req, res) {
    try {
      const { postcode } = req.params;
      const filters = {
        bankName: req.query.bank_name,
        category: req.query.category,
        page: parseInt(req.query.page) || 1,
        perPage: parseInt(req.query.per_page) || 100
      };

      const pensioners = await PensionModel.getPensionersByPostcode(postcode, filters);
      
      res.json({
        success: true,
        postcode,
        filters: {
          bank_name: filters.bankName,
          category: filters.category
        },
        pagination: {
          page: filters.page,
          per_page: filters.perPage,
          total_records: pensioners.length
        },
        pensioners
      });
    } catch (error) {
      // Error fetching pensioners by postcode
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pensioners by postcode'
      });
    }
  }

  static async searchPensioners(req, res) {
    try {
      const filters = {
        state: req.query.state,
        city: req.query.city,
        postcode: req.query.postcode,
        bankName: req.query.bank_name,
        category: req.query.category,
        ppoNumber: req.query.ppo_number,
        page: parseInt(req.query.page) || 1,
        perPage: parseInt(req.query.per_page) || 100
      };

      const pensioners = await PensionModel.searchPensioners(filters);
      
      res.json({
        success: true,
        filters_applied: {
          state: filters.state,
          city: filters.city,
          postcode: filters.postcode,
          bank_name: filters.bankName,
          category: filters.category,
          ppo_number: filters.ppoNumber
        },
        pagination: {
          page: filters.page,
          per_page: filters.perPage,
          total_records: pensioners.length
        },
        pensioners
      });
    } catch (error) {
      // Error searching pensioners
      res.status(500).json({
        success: false,
        message: 'Failed to search pensioners'
      });
    }
  }

  static async getAnalyticsSummary(req, res) {
    try {
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        category: req.query.category
      };

      // Check cache first
      const cacheKey = CacheController.getAnalyticsKey(filters);
      const cachedData = CacheController.get(cacheKey);
      
      if (cachedData) {
        // Serving analytics summary from cache
        return res.json({
          success: true,
          cached: true,
          filters_applied: filters,
          summary: cachedData
        });
      }

      // Fetching analytics summary from database
      const summary = await PensionModel.getAnalyticsSummary(filters);
      
      // Cache the result for 5 minutes
      CacheController.set(cacheKey, summary, 300);
      
      res.json({
        success: true,
        cached: false,
        filters_applied: filters,
        summary: {
          total_pensioners: summary.total_pensioners,
          total_banks: summary.total_banks,
          total_states: summary.total_states,
          total_cities: summary.total_cities,
          total_pincodes: summary.total_pincodes,
          total_categories: summary.total_categories
        }
      });
    } catch (error) {
      // Error fetching analytics summary
      res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics summary'
      });
    }
  }

  // Age-based filtering methods
  static async getAgeCategories(req, res) {
    try {
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        category: req.query.category
      };

      const ageCategories = await PensionModel.getAgeCategories(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_age_categories: ageCategories.length,
        age_categories: ageCategories.map(category => ({
          age_category: category.age_category,
          total_pensioners: category.total_pensioners,
          states_count: category.states_count,
          banks_count: category.banks_count
        }))
      });
    } catch (error) {
      // Error fetching age categories
      res.status(500).json({
        success: false,
        message: 'Failed to fetch age categories'
      });
    }
  }

  static async getAgeDistributionByState(req, res) {
    try {
      const filters = {
        bankName: req.query.bank_name,
        category: req.query.category
      };

      const ageDistribution = await PensionModel.getAgeDistributionByState(filters);
      
      // Group by state for better response structure
      const stateWiseDistribution = {};
      ageDistribution.forEach(item => {
        if (!stateWiseDistribution[item.state]) {
          stateWiseDistribution[item.state] = {
            state: item.state,
            age_distribution: {},
            total_pensioners: 0
          };
        }
        stateWiseDistribution[item.state].age_distribution[item.age_category] = item.total_pensioners;
        stateWiseDistribution[item.state].total_pensioners += item.total_pensioners;
      });

      res.json({
        success: true,
        filters_applied: filters,
        total_states: Object.keys(stateWiseDistribution).length,
        state_wise_age_distribution: Object.values(stateWiseDistribution)
      });
    } catch (error) {
      // Error fetching age distribution by state
      res.status(500).json({
        success: false,
        message: 'Failed to fetch age distribution by state'
      });
    }
  }

  static async getPensionersByAgeCategory(req, res) {
    try {
      const { ageCategory } = req.params;
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        category: req.query.category,
        page: parseInt(req.query.page) || 1,
        perPage: parseInt(req.query.per_page) || 100
      };

      const pensioners = await PensionModel.getPensionersByAgeCategory(ageCategory, filters);
      
      res.json({
        success: true,
        age_category: ageCategory,
        filters_applied: {
          state: filters.state,
          bank_name: filters.bankName,
          category: filters.category
        },
        pagination: {
          page: filters.page,
          per_page: filters.perPage,
          total_records: pensioners.length
        },
        pensioners
      });
    } catch (error) {
      // Error fetching pensioners by age category
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pensioners by age category'
      });
    }
  }

  static async getAgeAnalytics(req, res) {
    try {
      const filters = {
        state: req.query.state,
        bankName: req.query.bank_name,
        category: req.query.category
      };

      const ageAnalytics = await PensionModel.getAgeAnalytics(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        age_analytics: {
          total_pensioners: ageAnalytics.total_pensioners,
          average_age: Math.round(ageAnalytics.average_age * 10) / 10,
          min_age: Math.round(ageAnalytics.min_age * 10) / 10,
          max_age: Math.round(ageAnalytics.max_age * 10) / 10,
          age_distribution: {
            below_60: ageAnalytics.below_60,
            age_60_70: ageAnalytics.age_60_70,
            age_70_80: ageAnalytics.age_70_80,
            above_80: ageAnalytics.above_80
          },
          age_percentages: {
            below_60_percent: Math.round((ageAnalytics.below_60 / ageAnalytics.total_pensioners) * 100 * 10) / 10,
            age_60_70_percent: Math.round((ageAnalytics.age_60_70 / ageAnalytics.total_pensioners) * 100 * 10) / 10,
            age_70_80_percent: Math.round((ageAnalytics.age_70_80 / ageAnalytics.total_pensioners) * 100 * 10) / 10,
            above_80_percent: Math.round((ageAnalytics.above_80 / ageAnalytics.total_pensioners) * 100 * 10) / 10
          }
        }
      });
    } catch (error) {
      // Error fetching age analytics
      res.status(500).json({
        success: false,
        message: 'Failed to fetch age analytics'
      });
    }
  }

  // Enhanced Bank-wise filtering methods
  static async getBankStateDistribution(req, res) {
    try {
      const { bankName } = req.params;
      const filters = {
        category: req.query.category
      };

      const stateDistribution = await PensionModel.getBankStateDistribution(bankName, filters);
      
      res.json({
        success: true,
        bank_name: bankName,
        filters_applied: filters,
        total_states: stateDistribution.length,
        state_distribution: stateDistribution.map(state => ({
          state: state.state,
          total_pensioners: state.total_pensioners,
          cities_count: state.cities_count,
          pincodes_count: state.pincodes_count,
          categories_count: state.categories_count,
          branches_count: state.branches_count
        }))
      });
    } catch (error) {
      // Error fetching bank state distribution
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank state distribution'
      });
    }
  }

  static async getBankCityDistribution(req, res) {
    try {
      const { bankName, state } = req.params;
      const filters = {
        category: req.query.category
      };

      const cityDistribution = await PensionModel.getBankCityDistribution(bankName, state, filters);
      
      res.json({
        success: true,
        bank_name: bankName,
        state: state,
        filters_applied: filters,
        total_cities: cityDistribution.length,
        city_distribution: cityDistribution.map(city => ({
          city: city.pensioner_city,
          total_pensioners: city.total_pensioners,
          pincodes_count: city.pincodes_count,
          categories_count: city.categories_count,
          branches_count: city.branches_count
        }))
      });
    } catch (error) {
      // Error fetching bank city distribution
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank city distribution'
      });
    }
  }

  static async getBankBranchDistribution(req, res) {
    try {
      const { bankName } = req.params;
      const filters = {
        state: req.query.state,
        category: req.query.category,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const branchDistribution = await PensionModel.getBankBranchDistribution(bankName, filters);
      
      // Apply limit if specified
      const limitedResults = filters.limit ? branchDistribution.slice(0, filters.limit) : branchDistribution;
      
      res.json({
        success: true,
        bank_name: bankName,
        filters_applied: filters,
        total_branches: branchDistribution.length,
        branches_shown: limitedResults.length,
        branch_distribution: limitedResults.map(branch => ({
          branch_name: branch.branch_name,
          branch_postcode: branch.branch_postcode,
          state: branch.state,
          city: branch.pensioner_city,
          total_pensioners: branch.total_pensioners,
          categories_count: branch.categories_count,
          pincodes_served: branch.pincodes_served
        }))
      });
    } catch (error) {
      // Error fetching bank branch distribution
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank branch distribution'
      });
    }
  }

  static async getBankCategoryDistribution(req, res) {
    try {
      const { bankName } = req.params;
      const filters = {
        state: req.query.state
      };

      const categoryDistribution = await PensionModel.getBankCategoryDistribution(bankName, filters);
      
      res.json({
        success: true,
        bank_name: bankName,
        filters_applied: filters,
        total_categories: categoryDistribution.length,
        category_distribution: categoryDistribution.map(category => ({
          category: category.PSA,
          total_pensioners: category.total_pensioners,
          states_count: category.states_count,
          cities_count: category.cities_count,
          pincodes_count: category.pincodes_count
        }))
      });
    } catch (error) {
      // Error fetching bank category distribution
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank category distribution'
      });
    }
  }

  static async getBankAnalytics(req, res) {
    try {
      const { bankName } = req.params;
      const filters = {
        state: req.query.state,
        category: req.query.category
      };

      const bankAnalytics = await PensionModel.getBankAnalytics(bankName, filters);
      
      res.json({
        success: true,
        bank_name: bankName,
        filters_applied: filters,
        bank_analytics: {
          total_pensioners: bankAnalytics.total_pensioners,
          states_served: bankAnalytics.states_served,
          cities_served: bankAnalytics.cities_served,
          pincodes_served: bankAnalytics.pincodes_served,
          categories_served: bankAnalytics.categories_served,
          branches_count: bankAnalytics.branches_count,
          average_age: bankAnalytics.average_age ? Math.round(bankAnalytics.average_age * 10) / 10 : null
        }
      });
    } catch (error) {
      // Error fetching bank analytics
      res.status(500).json({
        success: false,
        message: 'Failed to fetch bank analytics'
      });
    }
  }

  // Comprehensive Multi-dimensional Filtering Controllers
  static async getComprehensiveStateFiltering(req, res) {
    try {
      const filters = {
        status: req.query.status || 'All',
        bank: req.query.bank || 'All',
        age: req.query.age || 'All',
        psa: req.query.psa || 'All'
      };

      const stateData = await PensionModel.getComprehensiveStateFiltering(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_states: stateData.length,
        state_distribution: stateData.map(state => ({
          state: state.state,
          total_pensioners: state.total_pensioners,
          cities_count: state.cities_count,
          pincodes_count: state.pincodes_count,
          banks_count: state.banks_count,
          categories_count: state.categories_count,
          branches_count: state.branches_count
        }))
      });
    } catch (error) {
      // Error fetching comprehensive state filtering
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comprehensive state filtering'
      });
    }
  }

  static async getComprehensiveCityFiltering(req, res) {
    try {
      const filters = {
        status: req.query.status || 'All',
        bank: req.query.bank || 'All',
        age: req.query.age || 'All',
        psa: req.query.psa || 'All',
        state: req.query.state || 'All'
      };

      const cityData = await PensionModel.getComprehensiveCityFiltering(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_cities: cityData.length,
        city_distribution: cityData.map(city => ({
          state: city.state,
          city: city.pensioner_city,
          total_pensioners: city.total_pensioners,
          pincodes_count: city.pincodes_count,
          banks_count: city.banks_count,
          categories_count: city.categories_count,
          branches_count: city.branches_count
        }))
      });
    } catch (error) {
      // Error fetching comprehensive city filtering
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comprehensive city filtering'
      });
    }
  }

  static async getComprehensivePincodeFiltering(req, res) {
    try {
      const filters = {
        status: req.query.status || 'All',
        bank: req.query.bank || 'All',
        age: req.query.age || 'All',
        psa: req.query.psa || 'All',
        state: req.query.state || 'All',
        city: req.query.city || 'All'
      };

      const pincodeData = await PensionModel.getComprehensivePincodeFiltering(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        total_pincodes: pincodeData.length,
        pincode_distribution: pincodeData.map(pincode => ({
          state: pincode.state,
          city: pincode.pensioner_city,
          pincode: pincode.pensioner_postcode,
          total_pensioners: pincode.total_pensioners,
          banks_count: pincode.banks_count,
          categories_count: pincode.categories_count,
          branches_count: pincode.branches_count
        }))
      });
    } catch (error) {
      // Error fetching comprehensive pincode filtering
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comprehensive pincode filtering'
      });
    }
  }

  static async getComprehensiveAnalytics(req, res) {
    try {
      const filters = {
        status: req.query.status || 'All',
        bank: req.query.bank || 'All',
        age: req.query.age || 'All',
        psa: req.query.psa || 'All',
        state: req.query.state || 'All',
        city: req.query.city || 'All'
      };

      const analytics = await PensionModel.getComprehensiveAnalytics(filters);
      
      res.json({
        success: true,
        filters_applied: filters,
        comprehensive_analytics: {
          total_pensioners: analytics.total_pensioners,
          states_count: analytics.states_count,
          cities_count: analytics.cities_count,
          pincodes_count: analytics.pincodes_count,
          banks_count: analytics.banks_count,
          categories_count: analytics.categories_count,
          branches_count: analytics.branches_count,
          average_age: analytics.average_age ? Math.round(analytics.average_age * 10) / 10 : null
        }
      });
    } catch (error) {
      // Error fetching comprehensive analytics
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comprehensive analytics'
      });
    }
  }
}

module.exports = PensionController;