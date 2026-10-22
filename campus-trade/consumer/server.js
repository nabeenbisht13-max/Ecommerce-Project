const path = require('path');
const { CONSUMER_PORT } = require('../config');
require('../shared/static-server')({ name: 'consumer', port: CONSUMER_PORT, publicDir: path.join(__dirname, 'public') });
