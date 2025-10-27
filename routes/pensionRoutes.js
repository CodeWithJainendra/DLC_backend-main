const express = require('express');
const router = express.Router();
const PensionController = require('../controllers/pensionController');
const GeographyController = require('../controllers/geographyController');


// Bank routes
router.get('/banks/list', PensionController.getBanksList);
router.get('/banks', PensionController.getBanksList); // Alternative endpoint for /banks
router.get('/banks/:bankName/pensioners', PensionController.getPensionersByBank);
router.get('/banks/state-summary', PensionController.getBankStateSummary);

// Category routes
router.get('/categories/list', PensionController.getCategoriesList);
router.get('/categories/:category/pensioners', PensionController.getPensionersByCategory);

// Geography routes - Comprehensive Statistics
router.get('/geography/states', GeographyController.getComprehensiveStats);
router.get('/geography/states/list', GeographyController.getStatesList);
router.get('/geography/states/:state/cities', GeographyController.getCitiesByState);

// Postcode routes
router.get('/postcodes/:postcode/pensioners', PensionController.getPensionersByPostcode);

// Search routes
router.get('/pensioners/search', PensionController.searchPensioners);

// Analytics routes
router.get('/analytics', PensionController.getAnalyticsSummary);
router.get('/analytics/summary', PensionController.getAnalyticsSummary);
router.get('/comprehensive-summary', PensionController.getComprehensiveAnalytics);

// Age-based filtering routes
router.get('/age/categories', PensionController.getAgeCategories);
router.get('/age/distribution-by-state', PensionController.getAgeDistributionByState);
router.get('/age/category/:ageCategory/pensioners', PensionController.getPensionersByAgeCategory);
router.get('/age/analytics', PensionController.getAgeAnalytics);

// Enhanced Bank-wise filtering routes
router.get('/banks/:bankName/state-distribution', PensionController.getBankStateDistribution);
router.get('/banks/:bankName/state/:state/city-distribution', PensionController.getBankCityDistribution);
router.get('/banks/:bankName/branch-distribution', PensionController.getBankBranchDistribution);
router.get('/banks/:bankName/category-distribution', PensionController.getBankCategoryDistribution);
router.get('/banks/:bankName/analytics', PensionController.getBankAnalytics);

// Comprehensive Multi-dimensional Filtering routes
router.get('/filtering/states', PensionController.getComprehensiveStateFiltering);
router.get('/filtering/cities', PensionController.getComprehensiveCityFiltering);
router.get('/filtering/pincodes', PensionController.getComprehensivePincodeFiltering);
router.get('/filtering/analytics', PensionController.getComprehensiveAnalytics);

const advancedRoutes = require('./advancedRoutes');router.use('/advanced', advancedRoutes);
module.exports = router;