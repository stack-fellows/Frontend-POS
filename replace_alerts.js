const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'pages/admin.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Toast state and showToast function
if (!content.includes('const [toast, setToast]')) {
  const stateInjectionStr = `
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string) => {
    let type: 'success' | 'error' | 'info' = 'error';
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('success') || lowerMsg.includes('complete')) type = 'success';
    else if (lowerMsg.includes('sent')) type = 'info';
    
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };
`;
  // Inject right after loading state
  content = content.replace(
    /const \[loading, setLoading\] = useState<boolean>\(false\);/,
    `const [loading, setLoading] = useState<boolean>(false);\n${stateInjectionStr}`
  );
}

// 2. Add the Toast component render inside the <main> block
if (!content.includes('toast && (')) {
  const toastRenderStr = `
        {/* Global Toast Notification */}
        {toast && (
          <div className={\`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg border text-sm font-semibold animate-in fade-in slide-in-from-top-4 \${
            toast.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 
            toast.type === 'info' ? 'bg-blue-50 text-blue-600 border-blue-200' :
            'bg-rose-50 text-rose-600 border-rose-200'
          }\`}>
            {toast.msg}
          </div>
        )}
`;
  // Inject right after <main> starts
  content = content.replace(
    /<main\n\s*className=\{`flex-1 h-screen transition-all duration-300 \$\{isSidebarExpanded \? 'pl-64' : 'pl-16'\n\s*\} flex flex-col`\}\n\s*>/,
    `<main\n        className={\`flex-1 h-screen transition-all duration-300 \${isSidebarExpanded ? 'pl-64' : 'pl-16'\n          } flex flex-col\`}\n      >\n${toastRenderStr}`
  );
}

// 3. Replace all alert( with showToast(
content = content.replace(/alert\(/g, 'showToast(');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating admin.tsx');
