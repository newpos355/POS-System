const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Preparing flat, direct deployment package for Hostinger...');

const rootDir = __dirname;
const outputDir = path.join(rootDir, 'production-release');

// 1. Clean previous release folder
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// 2. Build Frontend
console.log('📦 Step 1: Building frontend...');
execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

// 3. Copy built frontend directly to root of release (for direct public_html hosting)
const distSource = path.join(rootDir, 'frontend', 'dist');
fs.cpSync(distSource, outputDir, { recursive: true });

// 4. Copy backend production files into backend/
console.log('📦 Step 2: Copying backend...');
const backendSource = path.join(rootDir, 'backend');
const backendTarget = path.join(outputDir, 'backend');
fs.mkdirSync(backendTarget, { recursive: true });

const backendFolders = ['config', 'controllers', 'middleware', 'models', 'routes', 'seeders', 'utils'];
for (const folder of backendFolders) {
  const src = path.join(backendSource, folder);
  const dest = path.join(backendTarget, folder);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

const backendFiles = ['server.js', 'package.json', '.env.example'];
for (const file of backendFiles) {
  const src = path.join(backendSource, file);
  const dest = path.join(backendTarget, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// 5. Copy root production configs and reverse proxy
if (fs.existsSync(path.join(rootDir, 'ecosystem.config.js'))) {
  fs.copyFileSync(path.join(rootDir, 'ecosystem.config.js'), path.join(outputDir, 'ecosystem.config.js'));
}
if (fs.existsSync(path.join(rootDir, '.htaccess'))) {
  fs.copyFileSync(path.join(rootDir, '.htaccess'), path.join(outputDir, '.htaccess'));
}
const apiTarget = path.join(outputDir, 'api');
fs.mkdirSync(apiTarget, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'api', 'index.php'))) {
  fs.copyFileSync(path.join(rootDir, 'api', 'index.php'), path.join(apiTarget, 'index.php'));
}

// Package JSON
const rootPkg = {
  name: "pos-platform",
  version: "1.0.0",
  private: true,
  scripts: {
    "start": "cd backend && node server.js"
  }
};
fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rootPkg, null, 2));

// Create pos-release.zip
console.log('📦 Step 3: Compressing into pos-release.zip...');
const zipFile = path.join(rootDir, 'pos-release.zip');
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

try {
  execSync(`tar -acf "${zipFile}" *`, { cwd: outputDir, stdio: 'inherit' });
  console.log('✅ pos-release.zip created successfully!');
} catch (e) {
  console.log('Zip creation error:', e.message);
}

console.log('✅ Flat release structure prepared!');
