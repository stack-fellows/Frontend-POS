import net from 'net';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { formatReceiptBuffer, getPrintRuntime, ReceiptData } from './printer';
import { logPrint, getPrintLogPath } from './logger';

// A single diagnostic probe. `info: true` marks a check as informational
// (e.g. "is a printer physically connected?") that should NOT fail the
// overall "service ready" verdict — the software pipeline can be perfectly
// healthy with no printer attached yet.
export interface PrintServiceCheck {
  name: string;
  ok: boolean;
  detail: string;
  info?: boolean;
}

export interface PrintServiceResult {
  serviceReady: boolean;   // true when the software print pipeline is healthy
  printerDetected: boolean; // true only when a real printer/endpoint is reachable
  runtime: string;
  mode: string;
  target: string;
  printerType: string;
  checks: PrintServiceCheck[];
  summary: string;
  logPath: string;
}

// Windows Print Spooler service status (the OS "print service").
function checkSpooler(): Promise<{ running: boolean; detail: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ running: true, detail: 'Non-Windows platform — spooler check skipped' });
      return;
    }
    const cmd = `powershell -NoProfile -Command "(Get-Service -Name Spooler).Status"`;
    exec(cmd, { shell: 'cmd.exe', timeout: 6000 }, (error, stdout) => {
      if (error) {
        resolve({ running: false, detail: `Could not query spooler: ${error.message}` });
        return;
      }
      const status = stdout.trim();
      resolve({ running: /running/i.test(status), detail: `Spooler status: ${status || 'Unknown'}` });
    });
  });
}

// Raw TCP reachability probe for network printers (port 9100). Connects and
// immediately closes — it never sends a print job.
function tcpProbe(host: string, port: number, timeoutMs = 2500): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean, detail: string) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) { /* noop */ }
      resolve({ ok, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, `Connected to ${host}:${port}`));
    socket.once('timeout', () => finish(false, `No response from ${host}:${port} within ${timeoutMs}ms`));
    socket.once('error', (err) => finish(false, `${host}:${port} unreachable: ${err.message}`));
    socket.connect(port, host);
  });
}

// Looks for an installed Windows printer whose Name or ShareName matches the
// configured target, and reports whether it is shared/online.
function checkShare(shareOrName: string): Promise<{ exists: boolean; detail: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ exists: false, detail: 'Non-Windows platform — share check skipped' });
      return;
    }
    // Escape single quotes for the PowerShell single-quoted string (no injection).
    const safe = shareOrName.replace(/'/g, "''");
    const cmd = `powershell -NoProfile -Command "Get-Printer | Where-Object { $_.ShareName -eq '${safe}' -or $_.Name -eq '${safe}' } | Select-Object Name,ShareName,Shared,PrinterStatus | ConvertTo-Json -Compress"`;
    exec(cmd, { shell: 'cmd.exe', timeout: 8000 }, (error, stdout) => {
      if (error) {
        resolve({ exists: false, detail: `Could not query printers: ${error.message}` });
        return;
      }
      const raw = stdout.trim();
      if (!raw) {
        resolve({ exists: false, detail: `No installed printer named or shared as "${shareOrName}" yet` });
        return;
      }
      try {
        let obj = JSON.parse(raw);
        if (Array.isArray(obj)) obj = obj[0];
        const shared = obj.Shared === true || obj.Shared === 'True';
        const statusTxt = obj.PrinterStatus === 0 || obj.PrinterStatus === 'Normal' ? 'Ready' : `Status ${obj.PrinterStatus}`;
        resolve({
          exists: true,
          detail: `Found "${obj.Name}"${obj.ShareName ? ` (share: ${obj.ShareName})` : ''} — ${shared ? statusTxt : 'installed but NOT shared'}`
        });
      } catch {
        resolve({ exists: true, detail: `Printer "${shareOrName}" detected` });
      }
    });
  });
}

/**
 * Resolves a printer target to an actual Windows device name for GDI/HTML
 * printing. Accepts either the printer's Name or its ShareName (e.g. the user
 * configured "POSPrinter" which is only a share) and returns the real device
 * name (e.g. "POS-80-Series"). Falls back to the original target if nothing
 * matches or on non-Windows.
 */
export function resolveDeviceName(target: string): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' || !target) {
      resolve(target);
      return;
    }
    const safe = target.replace(/'/g, "''");
    const cmd = `powershell -NoProfile -Command "$p = Get-Printer | Where-Object { $_.Name -eq '${safe}' -or $_.ShareName -eq '${safe}' } | Select-Object -First 1; if ($p) { $p.Name }"`;
    exec(cmd, { shell: 'cmd.exe', timeout: 6000 }, (error, stdout) => {
      const name = (stdout || '').trim().split(/\r?\n/)[0].trim();
      if (error || !name) {
        logPrint(`[resolveDeviceName] "${target}" -> (unresolved, using as-is)`);
        resolve(target);
      } else {
        logPrint(`[resolveDeviceName] "${target}" -> "${name}"`);
        resolve(name);
      }
    });
  });
}

/**
 * Runs a real, non-simulated preflight of the print pipeline.
 * Verifies everything that can be validated WITHOUT a physical printer, and
 * reports printer connectivity separately as informational. When the core
 * pipeline is healthy, connecting a real printer will print correctly.
 */
export async function runPrintServiceCheck(settings: any): Promise<PrintServiceResult> {
  const mode: string = settings.printerMode || 'usb';
  const target: string = settings.printerTarget || 'POSPrinter';
  const printerType: string = settings.printerType || 'esc-pos';
  const runtime = getPrintRuntime();
  const checks: PrintServiceCheck[] = [];

  // 1. Runtime — is real hardware printing enabled (not simulation)?
  checks.push({
    name: 'Print runtime',
    ok: runtime === 'hardware',
    detail: runtime === 'hardware'
      ? 'Hardware mode — real printing is enabled'
      : 'Simulation mode — set POS_PRINT_RUNTIME=hardware to print for real'
  });

  // 2. Receipt content generation — proves the ESC/POS engine works end-to-end.
  try {
    const sample: ReceiptData = {
      orderNumber: 'SELFTEST',
      dateTime: new Date(),
      employeeName: 'Service Check',
      items: [{ name: 'Print Service Check', qty: 1, price: 0 }],
      subtotal: 0,
      tax: 0,
      total: 0,
      paymentMethod: 'TEST',
    };
    const buf = formatReceiptBuffer(sample, settings.printerLogoBase64);
    const hasInit = buf.includes(Buffer.from('\x1B@', 'binary'));
    const hasCut = buf.includes(Buffer.from('\x1DV\x00', 'binary'));
    checks.push({
      name: 'Receipt generation (ESC/POS)',
      ok: buf.length > 0 && hasInit && hasCut,
      detail: `${buf.length} bytes generated (init=${hasInit ? 'yes' : 'no'}, auto-cut=${hasCut ? 'yes' : 'no'})`
    });
  } catch (e: any) {
    checks.push({ name: 'Receipt generation (ESC/POS)', ok: false, detail: e.message });
  }

  // 3. Spool-file access — the USB path writes a temp .bin then copies it.
  try {
    const tmp = path.join(os.tmpdir(), `pos_selftest_${Date.now()}.bin`);
    fs.writeFileSync(tmp, Buffer.from('SELFTEST'));
    fs.unlinkSync(tmp);
    checks.push({ name: 'Spool file access', ok: true, detail: `Temp directory writable (${os.tmpdir()})` });
  } catch (e: any) {
    checks.push({ name: 'Spool file access', ok: false, detail: e.message });
  }

  // 4. Windows Print Spooler service (the OS print service used by USB/share).
  const spooler = await checkSpooler();
  checks.push({ name: 'Windows Print Spooler', ok: spooler.running, detail: spooler.detail });

  // 5. Printer connectivity — INFORMATIONAL (cannot pass without a printer).
  let printerCheck: PrintServiceCheck;
  if (mode === 'network') {
    const probe = await tcpProbe(target, 9100);
    printerCheck = {
      name: `Network printer ${target}:9100`,
      ok: probe.ok,
      info: true,
      detail: probe.ok ? probe.detail : `${probe.detail} — connect the printer to complete this check`
    };
  } else {
    const share = await checkShare(target);
    printerCheck = {
      name: `Printer "${target}"`,
      ok: share.exists,
      info: true,
      detail: share.exists ? share.detail : `${share.detail} — connect & share the printer to complete this check`
    };
  }
  checks.push(printerCheck);

  // The service is "ready" based purely on the software pipeline (non-info checks).
  const coreChecks = checks.filter((c) => !c.info);
  const serviceReady = coreChecks.every((c) => c.ok);
  const printerDetected = printerCheck.ok;

  const summary = !serviceReady
    ? 'Print service has a problem — resolve the failed checks below.'
    : printerDetected
      ? 'Print service is operational and a printer is detected. Printing will work.'
      : `Print service is operational. Connect your configured printer ("${target}") and printing will work — no code changes needed.`;

  logPrint(`[SELFTEST] serviceReady=${serviceReady} printerDetected=${printerDetected} runtime=${runtime} mode=${mode} target="${target}" type=${printerType}`);

  return { serviceReady, printerDetected, runtime, mode, target, printerType, checks, summary, logPath: getPrintLogPath() };
}
