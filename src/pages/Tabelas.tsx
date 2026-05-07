import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ScoringRules } from '../types';
import { Save, Loader2, Info, Calculator, Trophy, Shield, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';

const DEFAULT_RULES: ScoringRules = {
  id: 'scoring',
  win: 3,
  draw: 1,
  goal: 5,
  assist: 3,
  cleanSheet: 5,
  mvp: 10,
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

      <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="bg-primary-blue/5 p-3 md:p-4 rounded-2xl">
            <Calculator className="w-8 h-8 md:w-10 md:h-10 text-primary-blue" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-black uppercase italic mb-1 text-primary-blue">Como funciona o cálculo?</h3>
            <p className="text-gray-400 text-xs md:text-sm leading-relaxed">
              As pontuações são aplicadas automaticamente ao finalizar uma partida seguindo o regulamento da Liga Society.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pt-6 border-t border-gray-100">
          <div className="space-y-4">
            <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
              1. Resultado e Participação
            </h4>
            <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
              <li><strong className="text-gray-600">Vitória:</strong> +{rules.win} pontos para todos do time.</li>
              <li><strong className="text-gray-600">Empate:</strong> +{rules.draw} pontos para todos.</li>
              <li><strong className="text-gray-600">Gol Marcado:</strong> +{rules.goal} pontos por gol.</li>
              <li><strong className="text-gray-600">Assistência:</strong> +{rules.assist} pontos por assistência.</li>
            </ul>

            <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
              2. Goleiros
            </h4>
            <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
              <li><strong className="text-gray-600">Clean Sheet:</strong> +{rules.cleanSheet} pontos se não sofrer gols.</li>
              <li><strong className="text-gray-600">Bônus de Vitória:</strong> Se vencer, ganha ({rules.win} - gols sofridos).</li>
              <li><strong className="text-gray-600">Bônus Base:</strong> Começa com +{rules.win} pontos (mantido em caso de empate/derrota).</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
              3. Saldo de Gols
            </h4>
            <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
              <li><strong className="text-gray-600">Time Vencedor:</strong> Ganha pontos iguais ao saldo de gols.</li>
              <li><strong className="text-gray-600">Time Perdedor:</strong> Perde pontos iguais ao saldo negativo.</li>
            </ul>

            <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
              4. Craque da Partida
            </h4>
            <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
              <li><strong className="text-gray-600">Bônus MVP:</strong> +{rules.mvp} pontos para o melhor da partida.</li>
              <li><strong className="text-gray-600">Critério:</strong> Maior pontuação total na partida.</li>
              <li><strong className="text-gray-600">Desempate:</strong> Time vencedor &gt; Média temporada &gt; Menor overall.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
