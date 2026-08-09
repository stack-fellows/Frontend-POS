const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'main', 'generated');
const dest = path.join(__dirname, 'dist', 'main', 'generated');

function copyRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        console.warn(`Could not copy file ${entry.name}: ${err.message}`);
      }
    }
  }
}

if (fs.existsSync(src)) {
  console.log(`Copying generated client from ${src} to ${dest}...`);
  copyRecursive(src, dest);
  console.log('Copy complete.');
} else {
  console.error(`Source directory ${src} does not exist!`);
}
