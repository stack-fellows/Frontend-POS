// Standalone dev server starter — runs the local Express API on port 4000
// without needing Electron. Used for browser-based development.
require('./dist/main/env');
const { startLocalServer } = require('./dist/main/server');
startLocalServer();
console.log('[Dev] Local API server started on http://localhost:4000');
