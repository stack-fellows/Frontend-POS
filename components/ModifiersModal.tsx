import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

interface Modifier { id: string; name: string; price: number; }
interface ModifierGroup { id: string; name: string; minSelected: number; maxSelected: number; modifiers: Modifier[]; }
interface Variant { id: string; name: string; price: number; sku: string; }
interface Product { id: string; name: string; description: string | null; category: string; variants: Variant[]; }

interface ModifiersModalProps {
  product: Product;
  modifierGroups: ModifierGroup[];
  onClose: () => void;
  onAddToCart: (variant: Variant, selectedModifiers: Modifier[]) => void;
}

export default function ModifiersModal({ product, modifierGroups, onClose, onAddToCart }: ModifiersModalProps) {
  const [selectedVariant, setSelectedVariant] = useState<Variant>(product.variants[0]);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, Modifier[]>>({});
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const initial: Record<string, Modifier[]> = {};
    modifierGroups.forEach(g => { initial[g.id] = []; });
    setSelectedModifiers(initial);
  }, [modifierGroups]);

  useEffect(() => {
    let valid = true;
    for (const g of modifierGroups) {
      if ((selectedModifiers[g.id] || []).length < g.minSelected) { valid = false; break; }
    }
    setIsValid(valid);
  }, [selectedModifiers, modifierGroups]);

  const handleToggle = (groupId: string, modifier: Modifier, group: ModifierGroup) => {
    const cur = selectedModifiers[groupId] || [];
    const alreadySel = cur.some(m => m.id === modifier.id);
    let updated: Modifier[];
    if (group.maxSelected === 1) {
      updated = alreadySel ? (group.minSelected === 0 ? [] : [modifier]) : [modifier];
    } else {
      updated = alreadySel
        ? cur.filter(m => m.id !== modifier.id)
        : cur.length < group.maxSelected ? [...cur, modifier] : [...cur.slice(1), modifier];
    }
    setSelectedModifiers({ ...selectedModifiers, [groupId]: updated });
  };

  const calcTotal = () => {
    let t = selectedVariant.price;
    Object.values(selectedModifiers).forEach(mods => mods.forEach(m => t += m.price));
    return t;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-surface-100 border border-surface-200 rounded-lg overflow-hidden flex flex-col max-h-[90vh] shadow-card-lg">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-surface-200 bg-surface-50 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-surface-700">{product.name}</h2>
            {product.description && <p className="text-xs text-surface-400 mt-0.5">{product.description}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-200 border border-surface-300 text-surface-400 hover:text-surface-600 hover:bg-surface-300 transition flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

          {/* Variants */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Select Size</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {product.variants.map(v => (
                <button key={v.id} onClick={() => setSelectedVariant(v)}
                  className={`px-4 py-3 rounded-lg border text-left transition flex flex-col ${
                    selectedVariant.id === v.id
                      ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                      : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/40 hover:bg-surface-100'
                  }`}>
                  <span className="font-medium text-sm">{v.name}</span>
                  <span className="text-xs text-brand-500 mt-0.5">${v.price.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Modifier Groups */}
          {modifierGroups.map(group => {
            const cur = selectedModifiers[group.id] || [];
            return (
              <div key={group.id} className="space-y-2 pt-4 border-t border-surface-200">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{group.name}</h3>
                  <span className="text-[10px] text-surface-400">
                    {group.minSelected > 0 ? `Required · Min ${group.minSelected}` : `Optional · Max ${group.maxSelected}`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.modifiers.map(mod => {
                    const isSel = cur.some(m => m.id === mod.id);
                    return (
                      <button key={mod.id} onClick={() => handleToggle(group.id, mod, group)}
                        className={`px-4 py-2.5 rounded-lg border text-left transition flex justify-between items-center ${
                          isSel
                            ? 'bg-brand-500/15 border-brand-500/60 text-brand-400'
                            : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/40 hover:bg-surface-100'
                        }`}>
                        <span className="text-sm font-medium">{mod.name}</span>
                        <div className="flex items-center gap-2">
                          {mod.price > 0 && <span className="text-xs text-brand-500">+${mod.price.toFixed(2)}</span>}
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition ${isSel ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-300 bg-surface-100'}`}>
                            {isSel && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-200 bg-surface-50 flex justify-between items-center gap-4 shrink-0">
          <div>
            <span className="text-[10px] text-surface-400 font-medium uppercase tracking-wider">Total</span>
            <span className="text-xl font-semibold text-brand-400 block">${calcTotal().toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-surface-500 hover:text-surface-600 hover:bg-surface-200 text-sm font-medium transition">
              Cancel
            </button>
            <button onClick={() => { if (!isValid) return; onAddToCart(selectedVariant, Object.values(selectedModifiers).flat()); }} disabled={!isValid}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${isValid ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98] shadow-brand' : 'bg-surface-200 text-surface-400 cursor-not-allowed'}`}>
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
