const { body, query, param } = require('express-validator');

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('per_page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Per page must be between 1 and 1000')
];

const validateBankName = [
  param('bankName')
    .notEmpty()
    .withMessage('Bank name is required')
    .isLength({ min: 2 })
    .withMessage('Bank name must be at least 2 characters')
];

const validatePostcode = [
  param('postcode')
    .notEmpty()
    .withMessage('Postcode is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('Postcode must be 6 characters')
];

module.exports = {
  validatePagination,
  validateBankName,
  validatePostcode
};
