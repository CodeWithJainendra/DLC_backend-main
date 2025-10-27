const NodeCache = require('node-cache');

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

class CacheController {
  static get(key) {
    return cache.get(key);
  }

  static set(key, value, ttl = 300) {
    return cache.set(key, value, ttl);
  }

  static has(key) {
    return cache.has(key);
  }

  static del(key) {
    return cache.del(key);
  }

  static flush() {
    return cache.flushAll();
  }

  static getStats() {
    return cache.getStats();
  }

  // Cache key generators
  static getAnalyticsKey(filters = {}) {
    const filterStr = Object.keys(filters)
      .filter(key => filters[key])
      .map(key => `${key}=${filters[key]}`)
      .join('&');
    return `analytics_summary_${filterStr}`;
  }

  static getBanksKey() {
    return 'banks_list';
  }

  static getStatesKey(filters = {}) {
    const filterStr = Object.keys(filters)
      .filter(key => filters[key])
      .map(key => `${key}=${filters[key]}`)
      .join('&');
    return `states_list_${filterStr}`;
  }
}

module.exports = CacheController;
