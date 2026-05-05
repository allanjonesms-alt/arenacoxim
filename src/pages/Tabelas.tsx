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
        <Loader2 className="w-8 h-8 animate-spin text-[#00ff00]" />
      </div>
    );
  }

  const ruleFields = [
    { key: 'win', label: 'Vitória', icon: Trophy, color: 'text-yellow-500', description: 'Pontos por vitória na partida' },
    { key: 'draw', label: 'Empate', icon: Info, color: 'text-blue-500', description: 'Pontos por empate na partida' },
    { key: 'goal', label: 'Gol', icon: SoccerBall, color: 'text-red-500', description: 'Pontos por cada gol marcado' },
    { key: 'assist', label: 'Assistência', icon: SoccerCleat, color: 'text-[#00ff00]', description: 'Pontos por cada assistência' },
    { key: 'cleanSheet', label: 'Defesa Invicta', icon: Shield, color: 'text-cyan-500', description: 'Pontos por não sofrer gols (Goleiros/Zagueiros/Laterais)' },
    { key: 'mvp', label: 'Craque do Jogo', icon: Star, color: 'text-purple-500', description: 'Pontos extras para o melhor da partida' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight">Engine de Pontuação</h2>
          <p className="text-gray-500 text-sm">Configure quanto vale cada ação dos jogadores para o ranking.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-[#00ff00] text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(0,255,0,0.2)]"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Salvando...' : 'Salvar Regras'}
        </button>
      </div>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#00ff00]/10 border border-[#00ff00]/50 text-[#00ff00] p-4 rounded-xl flex items-center gap-3"
        >
          <Info className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider">Regras atualizadas com sucesso!</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ruleFields.map((field, i) => (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            key={field.key}
            className="bg-[#1a1a1a] p-6 rounded-2xl border border-white/5 hover:border-[#00ff00]/30 transition-colors group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl bg-white/5 ${field.color} group-hover:scale-110 transition-transform`}>
                  <field.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black uppercase italic tracking-wider">{field.label}</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{field.description}</p>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <input
                type="number"
                value={rules[field.key as keyof ScoringRules] as number}
                onChange={(e) => setRules({ ...rules, [field.key]: parseInt(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-2xl font-black italic focus:border-[#00ff00] focus:ring-1 focus:ring-[#00ff00] outline-none transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-gray-500 tracking-widest">
                Pontos
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5 space-y-6">
        <div className="flex items-center gap-6">
          <div className="bg-[#00ff00]/10 p-4 rounded-2xl">
            <Calculator className="w-10 h-10 text-[#00ff00]" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase italic mb-1">Como funciona o cálculo?</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              As pontuações são aplicadas automaticamente ao finalizar uma partida seguindo o regulamento da Liga Society.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
          <div className="space-y-4">
            <h4 className="text-[#00ff00] font-black uppercase italic text-sm">1. Resultado e Participação</h4>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li><strong className="text-white">Vitória:</strong> +3 pontos para todos do time.</li>
              <li><strong className="text-white">Empate:</strong> +1 ponto para todos.</li>
              <li><strong className="text-white">Gol Marcado:</strong> +2 pontos por gol.</li>
              <li><strong className="text-white">Assistência:</strong> +1 ponto por assistência.</li>
            </ul>

            <h4 className="text-[#00ff00] font-black uppercase italic text-sm">2. Goleiros</h4>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li><strong className="text-white">Clean Sheet:</strong> +3 pontos se não sofrer gols.</li>
              <li><strong className="text-white">Bônus de Vitória:</strong> Se vencer, ganha (3 - gols sofridos). Ex: Vitória de 4x1 rende +2 pontos de bônus.</li>
              <li><strong className="text-white">Bônus Base:</strong> Começa com +3 pontos (mantido em caso de empate/derrota).</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-[#00ff00] font-black uppercase italic text-sm">3. Saldo de Gols</h4>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li><strong className="text-white">Time Vencedor:</strong> Todos ganham pontos iguais ao saldo de gols (Ex: 4x2 = +2 pontos).</li>
              <li><strong className="text-white">Time Perdedor:</strong> Todos perdem pontos iguais ao saldo negativo (Ex: 2x5 = -3 pontos).</li>
            </ul>

            <h4 className="text-[#00ff00] font-black uppercase italic text-sm">4. Craque da Partida</h4>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li><strong className="text-white">Bônus MVP:</strong> +2 pontos para o melhor da partida.</li>
              <li><strong className="text-white">Critério:</strong> Maior pontuação total na partida.</li>
              <li><strong className="text-white">Desempate:</strong> 1º Time vencedor, 2º Média na temporada, 3º Menor overall.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
