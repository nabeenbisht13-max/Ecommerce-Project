const path = require('path');
const { SELLER_PORT } = require('../config');
require('../shared/static-server')({ name: 'seller', port: SELLER_PORT, publicDir: path.join(__dirname, 'public') });
