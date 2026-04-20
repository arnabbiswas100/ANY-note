#!/usr/bin/env node
/**
 * Study-Hub Database Reset Script
 * WARNING: This drops and recreates all tables.
 * Run: node scripts/db-reset.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function resetDB() {
  console.log('\n⚠️  Resetting Study-Hub Database (all data will be lost)...\n');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'studyhub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    // Drop all tables in correct dependency order
    await pool.query(`
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS chat_sessions CASCADE;
      DROP TABLE IF EXISTS pdfs CASCADE;
      DROP TABLE IF EXISTS pdf_folders CASCADE;
      DROP TABLE IF EXISTS notes CASCADE;
      DROP TABLE IF EXISTS note_folders CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    console.log('✅ Dropped all tables');

    // Re-apply schema
    const schemaPath = path.join(__dirname, '../backend/config/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
    console.log('✅ Schema reapplied');

    await pool.end();
    console.log('\n🎉 Database reset complete!\n');
  } catch (err) {
    console.error('\n❌ Reset failed:', err.message);
    process.exit(1);
  }
}

resetDB();
