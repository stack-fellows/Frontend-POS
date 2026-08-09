import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const envPath = (app && app.isPackaged)
  ? path.join(path.dirname(process.execPath), '.env')
  : path.join(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
  console.log(`[Env] Loaded environment variables from ${envPath}`);
} else {
  console.warn(`[Env] No .env file found at ${envPath}`);
}
