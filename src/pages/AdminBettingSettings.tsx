import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Settings, DollarSign, AlertCircle } from 'lucide-react';
import { AdminData } from '../types';

export default function AdminBettingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    maxBetAmount: 1.00
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'bettingParams'));
        if (snap.exists()) {
          setConfig(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.error('Error fetching betting config', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (config.maxBetAmount > 1.00) {
      alert('A aposta máxima permitida pelo sistema é de R$ 1,00.');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'bettingParams'), config, { merge: true });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving:', error);
      alert('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">Carregando configurações...</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-gradient-to-br from-primary-blue to-blue-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mt-20 -mr-20" />
        <div className="relative z-10">
          <h1 className="text-3xl font-black italic tracking-tight flex items-center gap-3">
            <Settings className="w-8 h-8 text-primary-yellow" />
            Configurações de Apostas
          </h1>
          <p className="text-blue-200 font-medium mt-2 max-w-xl">
            Painel centralizado para gerenciar regras de negócios e limites globais do sistema de apostas.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-8">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-gray-800 mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Limites Financeiros
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
               <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
                 Aposta Máxima (R$)
               </label>
               <input
                 type="number"
                 step="0.1"
                 min="0.1"
                 max="1.0"
                 value={config.maxBetAmount}
                 onChange={e => {
                   let val = Number(e.target.value);
                   if (val > 1.00) val = 1.00;
                   setConfig(prev => ({ ...prev, maxBetAmount: val }));
                 }}
                 className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-lg font-black text-gray-800 focus:ring-2 focus:ring-primary-blue outline-none transition-all"
               />
               <p className="text-[11px] text-gray-500 mt-3 flex items-start gap-1.5">
                 <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                 Define o teto de gastos por aposta para todos os usuários públicos (Máximo permitido: R$ 1,00).
               </p>
             </div>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-blue text-white px-8 py-4 rounded-xl font-black uppercase tracking-wider hover:bg-blue-900 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
          >
            {saving ? 'Salvando...' : (
              <>
                <Save className="w-5 h-5 text-primary-yellow" /> Salvar Configurações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
