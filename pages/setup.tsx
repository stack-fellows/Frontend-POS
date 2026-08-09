import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Building, Server, Printer, Lock, CheckCircle, ChevronRight, ChevronLeft, Loader2
} from 'lucide-react';

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    businessName: '',
    licenseKey: '',
    branchId: 'BR01',
    terminalId: 'T01',
    isMaster: true,
    cloudUrl: 'http://localhost:5000',
    printerMode: 'usb',
    printerTarget: 'POSPrinter',
    adminPin: '',
    adminName: 'Manager'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setError(null);
    try {
      const res = await fetch(`${formData.cloudUrl}/api/health`);
      if (res.ok) {
        setTestStatus('success');
      } else {
        throw new Error('Server unreachable or returned an error.');
      }
    } catch (err) {
      setTestStatus('error');
      setError('Could not connect to the cloud server. Make sure the URL is correct and the server is running.');
    }
  };

  const nextStep = () => {
    setError(null);
    setTestStatus('idle');
    if (step === 1 && (!formData.businessName || !formData.licenseKey)) {
      setError("Business Name and License Key are required.");
      return;
    }
    if (step === 2 && (!formData.branchId || !formData.terminalId)) {
      setError("Branch ID and Terminal ID are required.");
      return;
    }
    if (step === 3 && !formData.cloudUrl) {
      setError("Cloud Server URL is required.");
      return;
    }
    if (step === 4 && !formData.printerTarget) {
      setError("Printer name is required.");
      return;
    }
    if (step === 5 && (!formData.adminPin || formData.adminPin.length < 4)) {
      setError("A 4-digit Admin PIN is required.");
      return;
    }
    setStep(s => Math.min(s + 1, 6));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Create new settings object
      const settingsPayload = {
        setupComplete: true,
        businessName: formData.businessName,
        licenseKey: formData.licenseKey,
        isMaster: formData.isMaster,
        branchId: formData.branchId,
        terminalId: formData.terminalId,
        cloudUrl: formData.cloudUrl,
        printerMode: formData.printerMode,
        printerTarget: formData.printerTarget,
      };

      // 1. Save settings
      const settingsRes = await fetch('http://localhost:4000/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });

      if (!settingsRes.ok) throw new Error("Failed to save settings");

      // 2. Create the first Admin user
      const empPayload = {
        pin: formData.adminPin,
        name: formData.adminName,
        role: 'MANAGER'
      };

      await fetch('http://localhost:4000/api/settings/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empPayload)
      });

      // 3. Redirect to POS
      if (window.location.protocol === 'file:') {
        window.location.href = 'index.html';
      } else {
        window.location.href = 'http://localhost:3000';
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during setup');
      setIsSaving(false);
    }
  };

  const steps = [
    { id: 1, title: 'Welcome', icon: Building },
    { id: 2, title: 'Terminal', icon: Server },
    { id: 3, title: 'Network', icon: Server },
    { id: 4, title: 'Printer', icon: Printer },
    { id: 5, title: 'Security', icon: Lock },
    { id: 6, title: 'Complete', icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white font-sans">
      <Head>
        <title>Setup Wizard - POS</title>
      </Head>

      <div className="max-w-3xl w-full bg-zinc-900 border border-zinc-800  shadow-2xl overflow-hidden flex flex-col md:flex-row">

        {/* Left Sidebar - Steps */}
        <div className="w-full md:w-1/3 bg-zinc-800/50 p-6 border-b md:border-b-0 md:border-r border-zinc-700/50">
          <div className="mb-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Chimney Corner
            </h1>
            <p className="text-zinc-400 text-sm mt-1">Enterprise POS Setup</p>
          </div>

          <div className="space-y-4">
            {steps.map((s) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isPast = step > s.id;
              return (
                <div key={s.id} className={`flex items-center space-x-3 transition-colors ${isActive ? 'text-emerald-400' : isPast ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  <div className={`p-2 rounded-full ${isActive ? 'bg-emerald-400/10' : isPast ? 'bg-zinc-700' : 'bg-zinc-800'}`}>
                    <Icon size={18} />
                  </div>
                  <span className={`font-medium ${isActive ? 'text-white' : ''}`}>{s.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content - Forms */}
        <div className="w-full md:w-2/3 p-8 flex flex-col">
          <div className="flex-grow">
            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400  text-sm flex items-center">
                <span className="mr-2">⚠️</span> {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-white mb-6">Welcome to your new POS</h2>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Business Name</label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    placeholder="e.g. Chimney Corner DHA"
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Enterprise License Key</label>
                  <input
                    type="text"
                    name="licenseKey"
                    value={formData.licenseKey}
                    onChange={handleChange}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-white mb-6">Terminal Identification</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Branch ID</label>
                    <input
                      type="text"
                      name="branchId"
                      value={formData.branchId}
                      onChange={handleChange}
                      placeholder="BR01"
                      className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Terminal ID</label>
                    <input
                      type="text"
                      name="terminalId"
                      value={formData.terminalId}
                      onChange={handleChange}
                      placeholder="T01"
                      className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                </div>
                <div className="mt-4 p-4 bg-zinc-800/50  border border-zinc-700 flex items-start space-x-3">
                  <input
                    type="checkbox"
                    name="isMaster"
                    checked={formData.isMaster}
                    onChange={handleChange}
                    className="mt-1 w-4 h-4 text-emerald-500 bg-zinc-700 border-zinc-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <label className="font-medium text-white block">Master Terminal</label>
                    <p className="text-sm text-zinc-400">Enable this if this is the primary till that syncs directly with the cloud. Uncheck for secondary tills.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-white mb-6">Network Configuration</h2>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Cloud Server URL</label>
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      name="cloudUrl"
                      value={formData.cloudUrl}
                      onChange={handleChange}
                      placeholder="https://api.yourserver.com"
                      className="flex-grow bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      onClick={handleTestConnection}
                      disabled={testStatus === 'testing'}
                      className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white  transition-colors flex items-center whitespace-nowrap"
                    >
                      {testStatus === 'testing' ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                      Test Connection
                    </button>
                  </div>
                  {testStatus === 'success' && (
                    <p className="text-sm text-emerald-400 mt-2 flex items-center">
                      <CheckCircle size={14} className="mr-1" /> Connected successfully
                    </p>
                  )}
                  <p className="text-xs text-zinc-500 mt-2">The central database server this terminal will sync with.</p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-white mb-6">Receipt Printer Setup</h2>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Printer Connection Type</label>
                  <select
                    name="printerMode"
                    value={formData.printerMode}
                    onChange={handleChange}
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="usb">USB (Windows Shared Printer)</option>
                    <option value="network">Network (IP Address)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Printer Target</label>
                  <input
                    type="text"
                    name="printerTarget"
                    value={formData.printerTarget}
                    onChange={handleChange}
                    placeholder={formData.printerMode === 'usb' ? "POSPrinter" : "192.168.1.100"}
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    {formData.printerMode === 'usb' ? 'Enter the exact name of the shared printer in Windows.' : 'Enter the IP address of the thermal printer on the local network.'}
                  </p>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-white mb-6">Security & Admin</h2>
                <p className="text-sm text-zinc-400 mb-4">Create the first Manager account. This PIN will be required to access the Admin Dashboard.</p>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Manager Name</label>
                  <input
                    type="text"
                    name="adminName"
                    value={formData.adminName}
                    onChange={handleChange}
                    placeholder="e.g. John Doe"
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Secure PIN</label>
                  <input
                    type="password"
                    name="adminPin"
                    value={formData.adminPin}
                    onChange={handleChange}
                    placeholder="XXXX"
                    maxLength={4}
                    className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tracking-widest font-mono text-center text-lg"
                  />
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4 animate-in zoom-in-95 duration-300 flex flex-col items-center text-center pt-8">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle size={40} className="text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Ready to Launch</h2>
                <p className="text-zinc-400 max-w-sm">
                  Your terminal has been configured successfully. Click complete to start taking orders.
                </p>
              </div>
            )}
          </div>

          {/* Navigation Footer */}
          <div className="mt-12 flex justify-between items-center pt-6 border-t border-zinc-800">
            {step > 1 && step < 6 ? (
              <button
                onClick={prevStep}
                className="px-5 py-2.5 text-zinc-400 hover:text-white transition-colors flex items-center"
              >
                <ChevronLeft size={18} className="mr-1" /> Back
              </button>
            ) : <div />}

            {step < 6 ? (
              <button
                onClick={nextStep}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow-lg shadow-emerald-500/20 transition-all flex items-center"
              >
                Continue <ChevronRight size={18} className="ml-1" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isSaving}
                className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold  shadow-lg shadow-emerald-500/20 transition-all flex items-center disabled:opacity-70"
              >
                {isSaving ? <Loader2 size={18} className="mr-2 animate-spin" /> : null}
                {isSaving ? 'Initializing...' : 'Launch POS System'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
