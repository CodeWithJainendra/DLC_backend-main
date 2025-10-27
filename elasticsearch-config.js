/**
 * Elasticsearch Remote Server Configuration
 * Update the credentials below with your actual values
 */

// Set environment variables for Elasticsearch connection
process.env.ELASTICSEARCH_URL = 'http://cdis.iitk.ac.in:5002';
process.env.ELASTICSEARCH_USERNAME = 'elastic';  // Update with your username
process.env.ELASTICSEARCH_PASSWORD = 'changeme'; // Update with your password
process.env.ELASTICSEARCH_AUTH = 'true';

console.log('🔧 Elasticsearch configuration loaded:');
console.log(`   URL: ${process.env.ELASTICSEARCH_URL}`);
console.log(`   Username: ${process.env.ELASTICSEARCH_USERNAME}`);
console.log(`   Auth: ${process.env.ELASTICSEARCH_AUTH}`);

module.exports = {
  url: process.env.ELASTICSEARCH_URL,
  username: process.env.ELASTICSEARCH_USERNAME,
  password: process.env.ELASTICSEARCH_PASSWORD
};
