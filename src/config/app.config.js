const dotenv = require('dotenv');
const path = require('path');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'qa' ? '.env.qa' : 
                process.env.NODE_ENV === 'production' ? '.env.production' : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const config = {
  app: {
    name: process.env.APP_NAME || 'CivilWorks API',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 5000,
    url: process.env.APP_URL || 'http://localhost:5000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
    adminUrl: process.env.ADMIN_URL || 'http://localhost:4201',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME || 'civilworks_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'supersecretkey',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  }
};

module.exports = config;
