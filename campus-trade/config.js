// Central configuration. Override any value with an environment variable.
const num = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

module.exports = {
  HOST: process.env.HOST || '0.0.0.0',
  SERVER_PORT: num(process.env.SERVER_PORT, 3000),   // common API / event channel
  SELLER_PORT: num(process.env.SELLER_PORT, 3001),   // user 1 interface
  CONSUMER_PORT: num(process.env.CONSUMER_PORT, 3002), // consumer 1 interface
  CONSUMER2_PORT: num(process.env.CONSUMER2_PORT, 3003), // consumer 2 interface
  CONSUMER3_PORT: num(process.env.CONSUMER3_PORT, 3004), // consumer 3 interface
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',       // restrict in production
  DATA_FILE: process.env.DATA_FILE || require('path').join(__dirname, 'data', 'db.json'),

  CATEGORIES: ['Transport', 'Appliances', 'Electronics', 'Books', 'Furniture'],
  CONDITIONS: ['Like new', 'Good', 'Fair']
};
