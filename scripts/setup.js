#!/usr/bin/env node
/**
 * Study-Hub Setup Script
 * Run: node scripts/setup.js
 * This script sets up env, uploads dir, and initializes the database.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n🎓 Study-Hub Setup\n' + '='.repeat(40));

// 1. Create .env from .env.example if not exists
const envPath = path.join(__dirname, '../.env');
const envExample = path.join(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(envExample, envPath);
  console.log('✅ Created .env from .env.example');
  console.log('⚠️  Please edit .env with your database credentials and API keys before continuing!\n');
  process.exit(0);
} else {
  console.log('ℹ️  .env already exists');
}

// 2. Create upload directories
const dirs = ['uploads/pdfs', 'uploads/thumbnails'];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// 3. Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  console.log('✅ Dependencies installed');
} catch (err) {
  console.error('❌ npm install failed');
  process.exit(1);
}

// 4. Initialize database
console.log('\n🗄️  Initializing database...');
try {
  execSync('node scripts/db-init.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
} catch (err) {
  console.error('❌ Database init failed. Check your .env settings.');
  process.exit(1);
}

console.log('\n' + '='.repeat(40));
console.log('🎉 Setup complete! Run: npm start');
console.log('='.repeat(40) + '\n');
