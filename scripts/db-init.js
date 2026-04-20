#!/usr/bin/env node
/**
 * Study-Hub Database Initializer
 * Run: node scripts/db-init.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initDB() {
  console.log('\n📦 Initializing Study-Hub Database...\n');

  // Connect to default postgres DB first to create studyhub db if needed
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const dbName = process.env.DB_NAME || 'studyhub';

  try {
    // Create database if not exists
    const check = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
    );

    if (check.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database "${dbName}" created`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists`);
    }

    await adminPool.end();

    // Connect to the studyhub database and run schema
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: dbName,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    });

    const schemaPath = path.join(__dirname, '../backend/config/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    await pool.query(schema);
    console.log('✅ Schema applied successfully');

    await pool.end();
    console.log('\n🎉 Database initialization complete!\n');
  } catch (err) {
    console.error('\n❌ Database initialization failed:', err.message);
    console.error('\nMake sure PostgreSQL is running and your .env credentials are correct.\n');
    process.exit(1);
  }
}

initDB();
