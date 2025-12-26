// ============================================
// 📋 DATABASE CONFIGURATION - PostgreSQL
// ============================================
// This file sets up the PostgreSQL connection pool
// Migrated from MySQL to PostgreSQL for Render.com compatibility

const { Pool } = require('pg');
require('dotenv').config();

console.log('Database config:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

// Create a connection pool (better than single connection)
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gpsphere_db',
  port: parseInt(process.env.DB_PORT || '5432'), // PostgreSQL default port
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 30000, // Return an error after 30 seconds if connection cannot be established
};

// Enable SSL for cloud databases if DB_SSL is set to 'true'
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = {
    rejectUnauthorized: false // For most cloud providers (Render, etc.)
  };
  console.log('🔒 SSL enabled for database connection');
}

// If using Render's PostgreSQL, use connection string if available
if (process.env.DATABASE_URL) {
  // Render provides DATABASE_URL for PostgreSQL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  // Test connection
  pool.query('SELECT NOW()')
    .then(() => {
      console.log('✅ Connected to PostgreSQL database');
      console.log(`   Using DATABASE_URL connection string`);
    })
    .catch(err => {
      console.error('❌ Database connection failed:', err.message);
      logConnectionError(err, poolConfig);
    });

  module.exports = pool;
} else {
  // Use individual connection parameters
  const pool = new Pool(poolConfig);

  // Test connection
  pool.query('SELECT NOW()')
    .then(() => {
      console.log('✅ Connected to PostgreSQL database');
      console.log(`   Host: ${poolConfig.host}:${poolConfig.port}`);
      console.log(`   Database: ${poolConfig.database}`);
    })
    .catch(err => {
      console.error('❌ Database connection failed:', err.message);
      logConnectionError(err, poolConfig);
    });

  module.exports = pool;
}

// Helper function to log connection errors
function logConnectionError(err, poolConfig) {
  console.error('   Error code:', err.code);
  
  // Show current configuration (without password)
  console.error('\n📋 Current Database Configuration:');
  console.error(`   Host: ${poolConfig.host || 'NOT SET'}`);
  console.error(`   Port: ${poolConfig.port || 'NOT SET'}`);
  console.error(`   User: ${poolConfig.user || 'NOT SET'}`);
  console.error(`   Database: ${poolConfig.database || 'NOT SET'}`);
  console.error(`   SSL: ${poolConfig.ssl ? 'Enabled' : 'Disabled'}`);
  console.error(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
  
  console.error('\n💡 Troubleshooting tips:');
  
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('   ⚠️  Connection timeout/refused - This usually means:');
    console.error('   1. Database host is incorrect or unreachable');
    console.error('   2. Database is not running or not accessible from Render');
    console.error('   3. Firewall is blocking the connection');
    console.error('   4. Wrong port number (PostgreSQL uses 5432, not 3306)');
    console.error('   5. SSL required but not enabled (set DB_SSL=true)');
    console.error('\n   For Render.com PostgreSQL:');
    console.error('   - Render automatically sets DATABASE_URL environment variable');
    console.error('   - Use Render dashboard → Database → Internal Database URL');
    console.error('   - Or set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT manually');
  } else if (err.code === '28P01') {
    console.error('   ⚠️  Authentication failed - Check DB_USER and DB_PASSWORD');
  } else if (err.code === '3D000') {
    console.error('   ⚠️  Database does not exist - Run initialization script');
  }
  
  console.error('\n   General steps:');
  console.error('   1. Verify all DB_* environment variables in Render dashboard');
  console.error('   2. Check database is running and accessible');
  console.error('   3. For Render PostgreSQL, DATABASE_URL is set automatically');
  console.error('   4. Initialize database: Visit /api/init-db?secret=YOUR_SECRET');
}

// Export helper functions to maintain compatibility with MySQL-style API
// PostgreSQL pool manages connections automatically, but we provide wrappers
if (process.env.DATABASE_URL) {
  // For Render's DATABASE_URL connection
  const originalPool = pool;
  pool.getConnection = async function() {
    // Return a wrapper that mimics MySQL connection object
    return {
      query: async (text, params) => {
        const result = await originalPool.query(text, params);
        // Convert PostgreSQL result format to MySQL-like format
        return [result.rows, result];
      },
      release: () => {}, // No-op for PostgreSQL
      end: () => originalPool.end()
    };
  };
} else {
  const originalPool = pool;
  pool.getConnection = async function() {
    return {
      query: async (text, params) => {
        const result = await originalPool.query(text, params);
        return [result.rows, result];
      },
      release: () => {},
      end: () => originalPool.end()
    };
  };
}
