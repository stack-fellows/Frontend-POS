const electronExe = require('../node_modules/electron');
const { spawn } = require('child_process');

const child = spawn(electronExe, ['.'], {
  stdio: 'pipe',
  cwd: __dirname,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_LOG_FILE: 'electron-crash.log' }
});

child.stdout.on('data', d => console.log('STDOUT:', d.toString()));
child.stderr.on('data', d => console.log('STDERR:', d.toString()));

child.on('close', (code) => {
  console.log('Electron exited with code:', code);
  process.exit(0);
});

setTimeout(() => {
  child.kill();
  process.exit(0);
}, 8000);
