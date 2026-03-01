const path = require('path');
process.env.DOTENV_CONFIG_PATH = path.resolve(__dirname, '..', '.env.test');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
