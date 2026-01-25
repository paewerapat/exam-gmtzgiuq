const { execSync } = require('child_process');
const path = require('path');

// Change to the directory where this script is located
process.chdir(__dirname);

// Start Next.js
try {
  execSync('npx next start -p 3000', { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to start Next.js:', error);
  process.exit(1);
}
