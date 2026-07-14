import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, where } from 'firebase/firestore';
import { Player, Location, ScoringRules, Match } from '../types';
import { Trophy, Star, Users, MapPin, Ship, Crown } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../App';
import CalculationRules from '../components/CalculationRules';

interface ResenhaProps {
  locations: Location[];
}

export default function Resenha({ locations }: ResenhaProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [rules, setRules] = useState<ScoringRules | null>(null);

  useEffect(() => {
    let pLoaded = false;
    let mLoaded = false;

    const checkLoading = () => {
      if (pLoaded && mLoaded) {
        setLoading(false);
      }
    };

    const q = query(collection(db, 'players'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
      pLoaded = true;
      checkLoading();
    }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'players');
        pLoaded = true;
        checkLoading();
    });

    const mq = query(collection(db, 'matches'), where('status', '==', 'finished'));
    const unsubscribeMatches = onSnapshot(mq, (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
      mLoaded = true;
      checkLoading();
    }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'matches');
        mLoaded = true;
        checkLoading();
    });
    
    // Also fetch rules
    const unsubscribeRules = onSnapshot(doc(db, 'settings', 'scoring'), (snapshot) => {
       if (snapshot.exists()) {
         setRules(snapshot.data() as ScoringRules);
       }
    });

    return () => { 
      unsubscribe(); 
      unsubscribeMatches();
      unsubscribeRules(); 
    };
  }, []);

  if (loading) return null;

  const filteredPlayers = selectedLocationId === 'all' 
    ? players 
    : players.filter(p => p.locationId === selectedLocationId);

  // Stats calculations
  const topPoints = [...filteredPlayers]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => {
      const pointsA = a.stats.points || 0;
      const pointsB = b.stats.points || 0;
      return pointsB - pointsA;
    })
    .slice(0, 5);

  const isSgtNunes = (p: Player) => {
    const nicknameClean = (p.nickname || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nameClean = (p.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return nicknameClean.includes('SGTNUNES') || nameClean.includes('SGTNUNES');
  };

  const topScorers = [...filteredPlayers]
    .filter(p => p.stats.matches > 0 || isSgtNunes(p) || (p.stats.goals || 0) > 0)
    .sort((a, b) => b.stats.goals - a.stats.goals)
    .slice(0, 5);

  // Player stats aggregated directly from matches in selected location
  const playerStatsFromMatches = new Map<string, { wins: number; draws: number; matches: number }>();

  // Filter matches for specified location / all
  const filteredMatches = selectedLocationId === 'all'
    ? matches
    : matches.filter(m => m.locationId === selectedLocationId);

  filteredMatches.forEach(match => {
    const winner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];

    teamA.forEach(pid => {
      if (!playerStatsFromMatches.has(pid)) {
        playerStatsFromMatches.set(pid, { wins: 0, draws: 0, matches: 0 });
      }
      const st = playerStatsFromMatches.get(pid)!;
      st.matches++;
      if (winner === 'A') {
        st.wins++;
      } else if (winner === 'draw') {
        st.draws++;
      }
    });

    teamB.forEach(pid => {
      if (!playerStatsFromMatches.has(pid)) {
        playerStatsFromMatches.set(pid, { wins: 0, draws: 0, matches: 0 });
      }
      const st = playerStatsFromMatches.get(pid)!;
      st.matches++;
      if (winner === 'B') {
        st.wins++;
      } else if (winner === 'draw') {
        st.draws++;
      }
    });
  });

  const barcaPlayers = [...filteredPlayers]
    .map(p => {
      const ms = playerStatsFromMatches.get(p.id) || { wins: 0, draws: 0, matches: 0 };
      const aproveitamento = ms.matches > 0 ? ((ms.wins * 3) + ms.draws) / (ms.matches * 3) : 0;
      return {
        ...p,
        wins: ms.wins,
        draws: ms.draws,
        matches: ms.matches,
        aproveitamento
      };
    })
    .filter(p => p.matches >= 10);

  const worstGoleiro = barcaPlayers.filter(p => (p.position || '').toLowerCase() === 'goleiro').sort((a,b) => a.aproveitamento - b.aproveitamento).slice(0,1);
  const worstLinha = barcaPlayers.filter(p => (p.position || '').toLowerCase() !== 'goleiro').sort((a,b) => a.aproveitamento - b.aproveitamento).slice(0,6);

  const barca = [...worstGoleiro, ...worstLinha];

  // Most Victorious Players (Seleção de Ouro) calculated in the same positional pattern
  const bestGoleiro = barcaPlayers.filter(p => (p.position || '').toLowerCase() === 'goleiro').sort((a,b) => b.aproveitamento - a.aproveitamento).slice(0,1);
  const bestLinha = barcaPlayers.filter(p => (p.position || '').toLowerCase() !== 'goleiro').sort((a,b) => b.aproveitamento - a.aproveitamento).slice(0,6);

  const vitoriosos = [...bestGoleiro, ...bestLinha];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-primary-blue">Resenha Arena Coxim</h1>
        <p className="text-xs md:text-sm text-gray-500 font-medium max-w-lg mx-auto">
          Estatísticas oficiais da rodada, incluindo a Seleção de Ouro (melhores aproveitamentos), a Barca (piores aproveitamentos), artilharia e pontuação acumulada.
        </p>
      </div>

      {locations && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <div className="bg-primary-blue/5 p-2 rounded-xl mr-2">
                <MapPin className="w-5 h-5 text-primary-blue" />
            </div>
          <button
            onClick={() => setSelectedLocationId('all')}
            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedLocationId === 'all' ? 'bg-primary-blue text-white' : 'bg-white text-primary-gray shadow-sm border border-gray-100 hover:border-primary-blue/30'}`}
          >
            Todos
          </button>
          {locations.map(loc => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocationId(loc.id)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedLocationId === loc.id ? 'bg-primary-blue text-white' : 'bg-white text-primary-gray shadow-sm border border-gray-100 hover:border-primary-blue/30'}`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Top Points */}
        <section className="space-y-4">
             <div className="flex items-center gap-2">
                <div className="bg-primary-blue p-2 rounded-xl">
                  <Star className="w-5 h-5 text-primary-yellow" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-widest italic text-primary-blue">Top 5 Pontuadores</h3>
             </div>
             <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                {topPoints.length === 0 ? <p className="text-gray-400 text-sm p-4">Sem dados para este local.</p> : topPoints.map((p, i) => (
                    <div key={p.id} className="flex justify-between items-center p-3 border-b border-gray-50 last:border-b-0">
                        <span className="font-bold text-sm text-gray-700">{i + 1}. {(p.nickname || p.name).toUpperCase()}</span>
                        <span className="font-black text-primary-blue">{p.stats.points || 0} pts</span>
                    </div>
                ))}
             </div>
        </section>

        {/* Top Scorers */}
        <section className="space-y-4">
             <div className="flex items-center gap-2">
                <div className="bg-primary-blue p-2 rounded-xl">
                  <Trophy className="w-5 h-5 text-primary-yellow" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-widest italic text-primary-blue">Top 5 Artilheiros</h3>
             </div>
             <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                {topScorers.length === 0 ? <p className="text-gray-400 text-sm p-4">Sem dados para este local.</p> : topScorers.map((p, i) => (
                    <div key={p.id} className="flex justify-between items-center p-3 border-b border-gray-50 last:border-b-0">
                        <span className="font-bold text-sm text-gray-700">{i + 1}. {(p.nickname || p.name).toUpperCase()}</span>
                        <span className="font-black text-primary-blue">{p.stats.goals} gols</span>
                    </div>
                ))}
             </div>
        </section>
      </div>

      {/* SELEÇÃO DE OURO (MAIS VITORIOSOS) */}
      <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-baseline gap-2 border-b-2 border-emerald-500 pb-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-6 h-6 text-emerald-600" />
                  <h3 className="text-xl font-black uppercase tracking-widest italic text-emerald-600">Seleção de Ouro</h3>
                </div>
                <span className="text-xs md:text-sm font-bold text-emerald-500 uppercase tracking-wide opacity-80">(Mínimo de 10 partidas disputadas)</span>
          </div>
          <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100/50">
             {vitoriosos.length === 0 ? <p className="text-emerald-400 text-sm p-4">Sem dados suficientes para este local (atletas precisam ter no mínimo 10 partidas).</p> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {vitoriosos.map(p => (
                          <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100 flex justify-between items-center">
                              <div>
                                  <span className="font-bold text-gray-800 block">{(p.nickname || p.name).toUpperCase()}</span>
                                  <span className="text-[10px] font-black uppercase text-gray-400">{p.position}</span>
                              </div>
                              <div className="text-right">
                                  <span className="text-sm font-black text-emerald-600 block">{(p.aproveitamento * 100).toFixed(1)}%</span>
                                  <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-tighter">Aproveitamento</span>
                                  <span className="text-[9px] text-emerald-600 font-bold block leading-none mt-0.5">{p.wins}V - {p.draws}E - {p.matches - p.wins - p.draws}D</span>
                              </div>
                          </div>
                     ))}
                  </div>
             )}
          </div>
      </section>

      {/* BARCA */}
      <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-baseline gap-2 border-b-2 border-primary-yellow pb-2">
                <div className="flex items-center gap-2">
                  <Ship className="w-6 h-6 text-red-600" />
                  <h3 className="text-xl font-black uppercase tracking-widest italic text-red-600">Barca</h3>
                </div>
                <span className="text-xs md:text-sm font-bold text-red-500 uppercase tracking-wide opacity-80">(Mínimo de 10 partidas disputadas)</span>
          </div>
          <div className="bg-red-50 rounded-3xl p-6 border border-red-100">
             {barca.length === 0 ? <p className="text-red-400 text-sm p-4">Sem dados suficientes para este local (atletas precisam ter no mínimo 10 partidas).</p> : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {barca.map(p => (
                        <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-red-100 flex justify-between items-center">
                            <div>
                                <span className="font-bold text-gray-800 block">{(p.nickname || p.name).toUpperCase()}</span>
                                <span className="text-[10px] font-black uppercase text-gray-400">{p.position}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-black text-red-500 block">{(p.aproveitamento * 100).toFixed(1)}%</span>
                                <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-tighter">Aproveitamento</span>
                                <span className="text-[9px] text-red-500 font-bold block leading-none mt-0.5">{p.wins}V - {p.draws}E - {p.matches - p.wins - p.draws}D</span>
                            </div>
                        </div>
                    ))}
                 </div>
             )}
          </div>
      </section>

      {/* RANKING GERAL DE APROVEITAMENTO */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-baseline gap-2 border-b-2 border-primary-blue pb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary-blue" />
            <h3 className="text-xl font-black uppercase tracking-widest italic text-primary-blue">Ranking Geral de Aproveitamento</h3>
          </div>
          <span className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wide opacity-80">(Mínimo de 10 partidas disputadas)</span>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm overflow-hidden">
          {[...barcaPlayers].length === 0 ? (
            <p className="text-gray-400 text-sm p-4 text-center">Sem dados suficientes para este local (atletas precisam ter no mínimo 10 partidas).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-xs font-black uppercase tracking-wider text-gray-400 w-16 text-center">Pos</th>
                    <th className="pb-3 text-xs font-black uppercase tracking-wider text-gray-400">Atleta</th>
                    <th className="pb-3 text-xs font-black uppercase tracking-wider text-gray-400 text-right pr-4">Aproveitamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...barcaPlayers]
                    .sort((a, b) => b.aproveitamento - a.aproveitamento)
                    .map((p, index) => {
                      const isSelecao = vitoriosos.some(v => v.id === p.id);
                      const isBarca = barca.some(b => b.id === p.id);
                      
                      let nameColorClass = "text-gray-800";
                      let bgHighlightClass = "hover:bg-gray-50/50";
                      let badge = null;

                      if (isSelecao) {
                        nameColorClass = "text-emerald-600 font-black";
                        bgHighlightClass = "bg-emerald-50/20 hover:bg-emerald-50/40";
                        badge = (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Crown className="w-2.5 h-2.5 text-emerald-600" />
                            Seleção de Ouro
                          </span>
                        );
                      } else if (isBarca) {
                        nameColorClass = "text-red-600 font-black";
                        bgHighlightClass = "bg-red-50/20 hover:bg-red-50/40";
                        badge = (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter bg-red-100 text-red-800 border border-red-200">
                            <Ship className="w-2.5 h-2.5 text-red-600" />
                            Barca
                          </span>
                        );
                      }

                      return (
                        <tr key={p.id} className={`transition-colors ${bgHighlightClass}`}>
                          <td className="py-4 text-center">
                            <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                              index === 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              index === 1 ? 'bg-slate-100 text-slate-800 border border-slate-200' :
                              index === 2 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                              'text-gray-400'
                            }`}>
                              {index + 1}º
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center">
                              <span className={`text-sm tracking-tight ${nameColorClass}`}>
                                {(p.nickname || p.name).toUpperCase()}
                              </span>
                              {badge}
                            </div>
                          </td>
                          <td className="py-4 text-right pr-4">
                            <div className="inline-flex flex-col items-end">
                              <span className={`text-sm font-black ${
                                isSelecao ? 'text-emerald-600' :
                                isBarca ? 'text-red-500' :
                                'text-gray-950'
                              }`}>
                                {(p.aproveitamento * 100).toFixed(1)}%
                              </span>
                              <span className="text-[9px] text-gray-400 font-bold block leading-none mt-0.5">{p.wins}V - {p.draws}E - {p.matches - p.wins - p.draws}D</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {rules && <CalculationRules rules={rules} />}
    </div>
  );
}
