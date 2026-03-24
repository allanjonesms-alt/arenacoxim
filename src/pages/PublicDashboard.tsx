import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Player, Match, Location, Team, AdminData } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trophy, Star, MapPin, Calendar as CalendarIcon, ChevronRight, TrendingUp, User } from 'lucide-react';
import { motion } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';

interface PublicDashboardProps {
  adminData?: AdminData | null;
}

export default function PublicDashboard({ adminData }: PublicDashboardProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), orderBy('time', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      let matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        matchesData = matchesData.filter(m => m.locationId === adminData.locationId);
      }
      
      setMatches(matchesData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));

    const qPlayers = query(collection(db, 'players'));
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
      let playersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        playersData = playersData.filter(p => p.locationId === adminData.locationId);
      }
      
      setPlayers(playersData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      let teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        teamsData = teamsData.filter(t => t.locationId === adminData.locationId);
      }
      
      setTeams(teamsData);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'teams'));

    return () => {
      unsubscribeMatches();
      unsubscribePlayers();
      unsubscribeLocations();
      unsubscribeTeams();
    };
  }, [adminData]);

  const topScorers = [...players].sort((a, b) => b.stats.goals - a.stats.goals).slice(0, 5);
  const topPoints = [...players].sort((a, b) => (b.stats.points || 0) - (a.stats.points || 0)).slice(0, 5);

  const getLocationName = (locId: string) => {
    if (!locId) return 'Local não definido';
    const loc = locations.find(l => l.id === locId);
    if (loc) return loc.name;
    
    // Fallback: check if the locId matches a location name (for legacy data)
    const normalizedLocId = (locId || '').trim().toLowerCase();
    const locByName = locations.find(l => (l.name || '').trim().toLowerCase() === normalizedLocId);
    if (locByName) return locByName.name;
    
    return 'Local não definido';
  };

  if (loading) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Main Content: Match Results */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2">
              <TrendingUp className="text-[#00ff00]" /> Últimos Resultados
            </h2>
            {adminData && adminData.role !== 'master' && adminData.locationId && (
              <div className="flex items-center gap-1 text-gray-500 text-[10px] uppercase font-bold tracking-widest mt-1">
                <MapPin className="w-3 h-3 text-[#00ff00]" />
                Restrito a: {getLocationName(adminData.locationId)}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="bg-[#1a1a1a] p-12 rounded-2xl border border-white/5 text-center">
              <CalendarIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhuma partida registrada ainda.</p>
            </div>
          ) : (
            matches.map((match, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={match.id} 
                className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden hover:border-[#00ff00]/30 transition-colors group"
              >
                {/* Match Header */}
                <div className="bg-[#222] px-4 py-2 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-gray-400 border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#00ff00]" /> 
                      {getLocationName(match.locationId)}
                    </span>
                    <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3 text-[#00ff00]" /> {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded ${match.status === 'finished' ? 'bg-gray-800 text-gray-400' : 'bg-[#00ff00]/10 text-[#00ff00]'}`}>
                    {match.status === 'finished' ? 'Encerrado' : 'Agendado'}
                  </span>
                </div>

                {/* Scoreboard Area */}
                <div className="p-6 flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <div className="flex flex-col items-center gap-2 mb-1">
                      <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} size={32} />
                      <div className="text-sm md:text-lg font-black uppercase tracking-tight">
                        {teams.find(t => t.id === match.teamAId)?.name || 'Time não definido'}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {match.teamA.length} Atletas
                      {match.goalkeeperAId && (
                        <span className="block text-[#00ff00] mt-0.5">
                          GK: {players.find(p => p.id === match.goalkeeperAId)?.nickname || players.find(p => p.id === match.goalkeeperAId)?.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 md:gap-6 px-4 md:px-8">
                    <div className="text-3xl md:text-5xl font-black italic text-white tabular-nums">{match.scoreA}</div>
                    <div className="text-lg md:text-xl font-black text-[#00ff00] opacity-50">VS</div>
                    <div className="text-3xl md:text-5xl font-black italic text-white tabular-nums">{match.scoreB}</div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="flex flex-col items-center gap-2 mb-1">
                      <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} size={32} />
                      <div className="text-sm md:text-lg font-black uppercase tracking-tight">
                        {teams.find(t => t.id === match.teamBId)?.name || 'Time não definido'}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {match.teamB.length} Atletas
                      {match.goalkeeperBId && (
                        <span className="block text-[#00ff00] mt-0.5">
                          GK: {players.find(p => p.id === match.goalkeeperBId)?.nickname || players.find(p => p.id === match.goalkeeperBId)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Match Footer / Action */}
                <div className="bg-[#111] px-4 py-3 flex items-center justify-center border-t border-white/5 group-hover:bg-[#00ff00]/5 transition-colors">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff00] flex items-center gap-1">
                    Ver Detalhes da Partida <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Sidebars: Leaderboards */}
      <div className="lg:col-span-4 space-y-8">
        {/* Top Points */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-[#00ff00] p-1 rounded">
              <Star className="w-4 h-4 text-black" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest italic">Top 5 Pontuadores</h3>
          </div>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {topPoints.map((player, i) => (
              <div key={player.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                  <div className="relative">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                        <User size={20} className="text-gray-600" />
                      </div>
                    )}
                    {i === 0 && <Trophy className="w-4 h-4 text-yellow-500 absolute -top-1 -right-1 drop-shadow-lg" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold leading-tight">{player.nickname || player.name}</div>
                    </div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold tracking-tighter">{player.position}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-[#00ff00] italic leading-none">{(player.stats.points || 0).toFixed(1)}</div>
                  <div className="text-[8px] uppercase font-black text-gray-600 tracking-widest">Pontos</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top Scorers */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-[#00ff00] p-1 rounded">
              <SoccerBall size={16} className="text-black" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest italic">Top 5 Artilheiros</h3>
          </div>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {topScorers.map((player, i) => (
              <div key={player.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                      <User size={20} className="text-gray-600" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold leading-tight">{player.nickname || player.name}</div>
                    </div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold tracking-tighter">{player.stats.matches} Partidas</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-white italic leading-none">{player.stats.goals}</div>
                  <div className="text-[8px] uppercase font-black text-gray-600 tracking-widest">Gols</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Stats Banner */}
        <div className="bg-gradient-to-br from-[#00ff00] to-[#00cc00] p-6 rounded-2xl text-black">
          <h4 className="font-black uppercase italic text-xl leading-tight mb-2">Estatísticas em Tempo Real</h4>
          <p className="text-xs font-bold opacity-80 mb-4">Acompanhe o desempenho individual de cada atleta da nossa arena.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/10 p-3 rounded-xl">
              <div className="text-2xl font-black italic">{players.length}</div>
              <div className="text-[10px] uppercase font-bold opacity-60">Atletas</div>
            </div>
            <div className="bg-black/10 p-3 rounded-xl">
              <div className="text-2xl font-black italic">{matches.length}</div>
              <div className="text-[10px] uppercase font-bold opacity-60">Partidas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
