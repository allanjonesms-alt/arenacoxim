import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ScoringRules } from '../types';
import { Save, Loader2, Info, Calculator, Trophy, Shield, Star, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { SoccerBall, SoccerCleat, GoalkeeperGlove, PenaltyMissIcon } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import CalculationRules from '../components/CalculationRules';

const DEFAULT_RULES: ScoringRules = {
  id: 'scoring',
  win: 3,
  draw: 1,
  goal: 5,
  assist: 3,
  cleanSheet: 5,
  mvp: 10,
  penaltySave: 5,
  penaltyMiss: 5,
  updatedAt: Date.now()
};

export default function Tabelas() {
  const [rules, setRules] = useState<ScoringRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const docRef = doc(db, 'settings', 'scoring');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRules(docSnap.data() as ScoringRules);
        } else {
          // Initialize with defaults if not exists
          await setDoc(docRef, DEFAULT_RULES);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/scoring');
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      const updatedRules = {
        ...rules,
        updatedAt: Date.now()
      };
      await setDoc(doc(db, 'settings', 'scoring'), updatedRules);
      setRules(updatedRules);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/scoring');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-blue" />
      </div>
    );
  }

  const ruleFields = [
    { key: 'win', label: 'Vitória', icon: Trophy, color: 'text-yellow-500', bgColor: 'bg-yellow-50', description: 'Pontos por vitória na partida' },
    { key: 'draw', label: 'Empate', icon: Info, color: 'text-blue-500', bgColor: 'bg-blue-50', description: 'Pontos por empate na partida' },
    { key: 'goal', label: 'Gol', icon: SoccerBall, color: 'text-red-500', bgColor: 'bg-red-50', description: 'Pontos por cada gol marcado' },
    { key: 'assist', label: 'Assistência', icon: SoccerCleat, color: 'text-green-500', bgColor: 'bg-green-50', description: 'Pontos por cada assistência' },
    { key: 'cleanSheet', label: 'Defesa Invicta', icon: Shield, color: 'text-cyan-500', bgColor: 'bg-cyan-50', description: 'Pontos por não sofrer gols' },
    { key: 'penaltySave', label: 'Defesa de Pênalti', icon: GoalkeeperGlove, color: 'text-orange-500', bgColor: 'bg-orange-50', description: 'Defesa de pênalti (Apenas Goleiro)' },
    { key: 'penaltyMiss', label: 'Pênalti Perdido', icon: PenaltyMissIcon, color: 'text-red-500', bgColor: 'bg-red-50', description: 'Ação negativa se desperdiçar cobrança' },
    { key: 'mvp', label: 'Craque do Jogo', icon: Star, color: 'text-purple-500', bgColor: 'bg-purple-50', description: 'Pontos extras para o melhor da partida' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-primary-blue">Engine de Pontuação</h2>
          <p className="text-gray-500 text-sm">Configure quanto vale cada ação dos jogadores para o ranking.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-primary-blue text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Salvando...' : 'Salvar Regras'}
        </button>
      </div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 text-green-600 p-4 rounded-xl flex items-center gap-3"
        >
          <Info className="w-5 h-5" />
          <span className="text-xs md:text-sm font-bold uppercase tracking-wider">Regras atualizadas com sucesso!</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {ruleFields.map((field, i) => (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            key={field.key}
            className="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 hover:border-primary-blue/20 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${field.bgColor} ${field.color} group-hover:scale-110 transition-transform`}>
                  <field.icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h3 className="font-black uppercase italic tracking-wider text-primary-blue text-sm md:text-base">{field.label}</h3>
                  <p className="text-[9px] md:text-[10px] text-gray-400 uppercase font-bold tracking-widest">{field.description}</p>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <input
                type="number"
                value={rules[field.key as keyof ScoringRules] as number}
                onChange={(e) => setRules({ ...rules, [field.key]: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xl md:text-2xl font-black italic focus:border-primary-blue focus:ring-1 focus:ring-primary-blue outline-none transition-all text-primary-blue"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] md:text-[10px] font-black uppercase text-gray-400 tracking-widest">
                Pontos
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <CalculationRules rules={rules} />
    </div>
  );
}
