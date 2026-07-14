import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { OddsEngineConfig } from '../types';
import { Save, ArrowLeft, Settings2, Activity, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../App';

const DEFAULT_CONFIG: OddsEngineConfig = {
  matchWinner: {
    drawBaseProbability: 0.25, // Adjusted to 25% base so average across games aligns closer to the historical 18%
    drawDiffDenominator: 15, // Increased to make the probability drop slower when teams are slightly unbalanced
    amplificationPower: 5,
    margin: 1.25, // Lowered from 1.40
  },
  floatingOdds: {
    enabled: true,
    liquidityFactor: 1000, // R$ 1000 para começar a ter influência média
  },
  societyGoalFrequencyMultiplier: 2.00,
  societyAssistFrequencyMultiplier: 1.80,
  margins: {
    almostCertain: 1.30,
    probable: 1.50,
    medium: 1.80,
    improbable: 2.50,
    veryImprobable: 4.00,
  },
  maxOdd: 12.00,
  baseGoals: {
    centroavante: 1.20,
    meioCampo: 0.80,
    zagueiro: 0.20,
    lateral: 0.40,
    goleiro: 0.02,
    default: 0.60,
  },
  baseAssists: {
    centroavante: 0.50,
    meioCampo: 0.90,
    zagueiro: 0.20,
    lateral: 0.60,
    goleiro: 0.05,
    default: 0.60,
  },
};

export default function AdminOddsEngine() {
  const [config, setConfig] = useState<OddsEngineConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'settings', 'oddsEngine');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<OddsEngineConfig>;
          setConfig(prev => ({
            ...prev,
            ...data,
            matchWinner: {
              ...prev.matchWinner,
              ...data.matchWinner
            },
            floatingOdds: {
              ...prev.floatingOdds,
              ...data.floatingOdds
            },
            margins: {
              ...prev.margins,
              ...data.margins
            },
            baseGoals: {
              ...prev.baseGoals,
              ...data.baseGoals
            },
            baseAssists: {
              ...prev.baseAssists,
              ...data.baseAssists
            }
          }) as OddsEngineConfig);
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.GET, 'settings/oddsEngine');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'oddsEngine');
      await setDoc(docRef, config);
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/oddsEngine');
    } finally {
      setSaving(false);
    }
  };

  const handleNestedChange = (section: keyof OddsEngineConfig, field: string, value: string) => {
    const numValue = parseFloat(value.replace(',', '.')) || 0;
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as any || {}),
        [field]: numValue
      }
    }));
  };

  const handleFlatChange = (field: keyof OddsEngineConfig, value: string) => {
    const numValue = parseFloat(value.replace(',', '.')) || 0;
    setConfig(prev => ({
      ...prev,
      [field]: numValue
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-blue"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/home-hub" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-6 h-6 text-primary-blue" />
        </Link>
        <div>
          <h1 className="text-2xl font-black uppercase text-primary-blue tracking-tight flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-primary-yellow" /> Configurações de Odds
          </h1>
          <p className="text-sm font-bold text-gray-400 mt-1">Ajuste o motor matemático do simulador de confrontos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Match Winner Settings */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-primary-yellow flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-primary-yellow" /> Vencedor da Partida (1X2)
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Prob. Base Empate (ex: 0.15 = 15%)</label>
              <input
                type="number"
                step="0.01"
                value={config.matchWinner?.drawBaseProbability ?? 0.15}
                onChange={e => handleNestedChange('matchWinner', 'drawBaseProbability', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Probabilidade inicial de empate antes do ajuste de força das equipes.</p>
            </div>
            
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Fator de Empate (ex: 12)</label>
              <input
                type="number"
                step="1"
                value={config.matchWinner?.drawDiffDenominator ?? 12}
                onChange={e => handleNestedChange('matchWinner', 'drawDiffDenominator', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
               <p className="text-[10px] text-gray-400 mt-1">Denominador para redução da prop. de empate quando há diferença de forças. Maior valor = empates mais frequentes.</p>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Força da Vantagem (ex: 5)</label>
              <input
                type="number"
                step="0.1"
                value={config.matchWinner?.amplificationPower ?? 5}
                onChange={e => handleNestedChange('matchWinner', 'amplificationPower', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Potência aplicada para amplificar a diferença técnica entre os times.</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Margem da Casa (ex: 1.25 = 25%)</label>
              <input
                type="number"
                step="0.01"
                value={config.matchWinner?.margin ?? 1.25}
                onChange={e => handleNestedChange('matchWinner', 'margin', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Ajuste Flutuante (Mercado) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-purple-600 flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" /> Ajuste Flutuante (Mercado)
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="floating-odds-enabled"
                checked={config.floatingOdds?.enabled ?? true}
                onChange={e => setConfig(prev => ({
                  ...prev,
                  floatingOdds: {
                    ...(prev.floatingOdds as any || {}),
                    enabled: e.target.checked
                  }
                }))}
                className="w-5 h-5 text-primary-blue rounded border-gray-300 focus:ring-primary-blue"
              />
              <label htmlFor="floating-odds-enabled" className="text-sm font-bold text-gray-700 cursor-pointer">
                Ativar ajuste flutuante por volume
              </label>
            </div>
            
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Fator de Liquidez (ex: 1000)</label>
              <input
                type="number"
                step="100"
                value={config.floatingOdds?.liquidityFactor ?? 1000}
                onChange={e => handleNestedChange('floatingOdds', 'liquidityFactor', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
                disabled={!(config.floatingOdds?.enabled ?? true)}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Volume financeiro (em R$) necessário para que o mercado influencie as odds em 50%.
              </p>
            </div>
          </div>
        </div>

        {/* Multipliers & Settings */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-emerald-600 flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" /> Multiplicadores Gerais
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Freq. Gols Society (ex: 2.00)</label>
              <input
                type="number"
                step="0.01"
                value={config.societyGoalFrequencyMultiplier}
                onChange={e => handleFlatChange('societyGoalFrequencyMultiplier', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Aumenta/diminui a proporção de gols em relação ao histórico.</p>
            </div>
            
            <div>
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Freq. Assistências Society (ex: 1.80)</label>
              <input
                type="number"
                step="0.01"
                value={config.societyAssistFrequencyMultiplier}
                onChange={e => handleFlatChange('societyAssistFrequencyMultiplier', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
            </div>
            
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-[11px] font-black uppercase text-gray-500 tracking-wide mb-1">Limite Máximo da Odd (Max Odd)</label>
              <input
                type="number"
                step="0.1"
                value={config.maxOdd}
                onChange={e => handleFlatChange('maxOdd', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-blue outline-none transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">O valor máximo exibido. Valores maiores que isso mostrarão o teto (ex: 12.00).</p>
            </div>
          </div>
        </div>

        {/* Margins */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-primary-blue flex items-center gap-2 mb-4">
            Margens da Casa (House Edge)
          </h2>
          
          <div className="space-y-3">
            {[
              { label: 'Quase Certo (>80%)', field: 'almostCertain' as keyof OddsEngineConfig['margins'] },
              { label: 'Provável (>50%)', field: 'probable' as keyof OddsEngineConfig['margins'] },
              { label: 'Médio (>30%)', field: 'medium' as keyof OddsEngineConfig['margins'] },
              { label: 'Improvável (>10%)', field: 'improbable' as keyof OddsEngineConfig['margins'] },
              { label: 'Muito Improvável (<10%)', field: 'veryImprobable' as keyof OddsEngineConfig['margins'] },
            ].map(item => (
              <div key={item.field} className="flex items-center justify-between gap-4">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-tight flex-1">{item.label}</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.margins[item.field]}
                  onChange={e => handleNestedChange('margins', item.field, e.target.value)}
                  className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-right focus:ring-2 focus:ring-primary-blue outline-none"
                />
              </div>
            ))}
            <p className="text-[10px] text-gray-400 mt-2">Valores como 1.30 representam 30% de margem (a odd final é dividida por 1.30).</p>
          </div>
        </div>

        {/* Base Goals */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2 mb-4">
            Base de Gols (por Posição)
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Centroavante', field: 'centroavante' as keyof OddsEngineConfig['baseGoals'] },
              { label: 'Meio-Campo', field: 'meioCampo' as keyof OddsEngineConfig['baseGoals'] },
              { label: 'Lateral', field: 'lateral' as keyof OddsEngineConfig['baseGoals'] },
              { label: 'Zagueiro', field: 'zagueiro' as keyof OddsEngineConfig['baseGoals'] },
              { label: 'Goleiro', field: 'goleiro' as keyof OddsEngineConfig['baseGoals'] },
              { label: 'Padrão (Outros)', field: 'default' as keyof OddsEngineConfig['baseGoals'] },
            ].map(item => (
              <div key={item.field} className="flex items-center justify-between gap-4">
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide flex-1">{item.label}</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.baseGoals[item.field]}
                  onChange={e => handleNestedChange('baseGoals', item.field, e.target.value)}
                  className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-right focus:ring-2 focus:ring-primary-blue outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Base Assists */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-2 mb-4">
            Base de Assistências (por Posição)
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Centroavante', field: 'centroavante' as keyof OddsEngineConfig['baseAssists'] },
              { label: 'Meio-Campo', field: 'meioCampo' as keyof OddsEngineConfig['baseAssists'] },
              { label: 'Lateral', field: 'lateral' as keyof OddsEngineConfig['baseAssists'] },
              { label: 'Zagueiro', field: 'zagueiro' as keyof OddsEngineConfig['baseAssists'] },
              { label: 'Goleiro', field: 'goleiro' as keyof OddsEngineConfig['baseAssists'] },
              { label: 'Padrão (Outros)', field: 'default' as keyof OddsEngineConfig['baseAssists'] },
            ].map(item => (
              <div key={item.field} className="flex items-center justify-between gap-4">
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide flex-1">{item.label}</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.baseAssists[item.field]}
                  onChange={e => handleNestedChange('baseAssists', item.field, e.target.value)}
                  className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-right focus:ring-2 focus:ring-primary-blue outline-none"
                />
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="flex justify-end pt-4">
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
  );
}
