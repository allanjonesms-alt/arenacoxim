import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { Player, Location, ScoringRules } from '../types';
import { Trophy, Star, Users, MapPin, Ship } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../App';
import CalculationRules from '../components/CalculationRules';

interface ResenhaProps {
  locations: Location[];
}

export default function Resenha({ locations }: ResenhaProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [rules, setRules] = useState<ScoringRules | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'players'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
      setLoading(false);
    }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'players');
        setLoading(false);
    });
    
    // Also fetch rules
    const unsubscribeRules = onSnapshot(doc(db, 'settings', 'scoring'), (snapshot) => {
       if (snapshot.exists()) {
         setRules(snapshot.data() as ScoringRules);
       }
    });

    return () => { unsubscribe(); unsubscribeRules(); };
  }, []);

  if (loading) return null;

  const filteredPlayers = selectedLocationId === 'all' 
    ? players 
    : players.filter(p => p.locationId === selectedLocationId);

  // Stats calculations
  const topPoints = [...filteredPlayers]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => b.stats.points - a.stats.points)
    .slice(0, 5);

  const topScorers = [...filteredPlayers]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => b.stats.goals - a.stats.goals)
    .slice(0, 5);

  const barcaPlayers = [...filteredPlayers]
    .filter(p => p.stats.matches > 3)
    .map(p => ({
        ...p,
        winRate: p.stats.wins / p.stats.matches
    }));

  const worstGoleiro = barcaPlayers.filter(p => p.position.toLowerCase() === 'goleiro').sort((a,b) => a.winRate - b.winRate).slice(0,1);
  const worstZagueiro = barcaPlayers.filter(p => p.position.toLowerCase() === 'zagueiro').sort((a,b) => a.winRate - b.winRate).slice(0,1);
  const worstLaterais = barcaPlayers.filter(p => p.position.toLowerCase() === 'lateral').sort((a,b) => a.winRate - b.winRate).slice(0,2);
  const worstMeias = barcaPlayers.filter(p => p.position.toLowerCase() === 'meio-campo').sort((a,b) => a.winRate - b.winRate).slice(0,2);
  const worstAtacante = barcaPlayers.filter(p => p.position.toLowerCase() === 'centroavante').sort((a,b) => a.winRate - b.winRate).slice(0,1);

  const barca = [...worstGoleiro, ...worstZagueiro, ...worstLaterais, ...worstMeias, ...worstAtacante];

    return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
      <h1 className="text-3xl font-black uppercase italic tracking-tighter text-primary-blue text-center">Resenha Arena Coxim</h1>

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
                        <span className="font-black text-primary-blue">{p.stats.points} pts</span>
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

      {/* BARCA */}
      <section className="space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-primary-yellow pb-2">
                <Ship className="w-6 h-6 text-red-600" />
                <h3 className="text-xl font-black uppercase tracking-widest italic text-red-600">Barca</h3>
          </div>
          <div className="bg-red-50 rounded-3xl p-6 border border-red-100">
             {barca.length === 0 ? <p className="text-red-400 text-sm p-4">Sem dados suficientes para este local.</p> : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {barca.map(p => (
                        <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-red-100 flex justify-between items-center">
                            <div>
                                <span className="font-bold text-gray-800 block">{(p.nickname || p.name).toUpperCase()}</span>
                                <span className="text-[10px] font-black uppercase text-gray-400">{p.position}</span>
                            </div>
                            <span className="text-sm font-black text-red-500">{(p.winRate * 100).toFixed(1)}% vitórias</span>
                        </div>
                    ))}
                 </div>
             )}
          </div>
      </section>
      {rules && <CalculationRules rules={rules} />}
    </div>
  );
}
