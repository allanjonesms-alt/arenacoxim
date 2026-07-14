import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, where, limit, getDoc, doc, getDocs } from 'firebase/firestore';
import { Player, Match, Location, Team, AdminData, ScoringRules } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Calendar as CalendarIcon, ChevronRight, TrendingUp, User, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { handleFirestoreError, OperationType } from '../App';
import { PlayerSummaryModal } from '../components/PlayerSummaryModal';
import { useNavigate } from 'react-router-dom';

interface MatchHistoryProps {
  adminData?: AdminData | null;
  sharedLocations: Location[];
  sharedTeams: Team[];
  sharedScoringRules: ScoringRules | null;
}

export default function MatchHistory({ adminData, sharedLocations, sharedTeams, sharedScoringRules }: MatchHistoryProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>(sharedTeams);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(sharedScoringRules);
  const [matchLimit, setMatchLimit] = useState(30);
  const navigate = useNavigate();

  useEffect(() => {
    setTeams(sharedTeams);
  }, [sharedTeams]);

  useEffect(() => {
    setScoringRules(sharedScoringRules);
  }, [sharedScoringRules]);

  useEffect(() => {
    let qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), limit(matchLimit));
    
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qMatches = query(
        collection(db, 'matches'), 
        where('locationId', '==', adminData.locationId),
        orderBy('date', 'desc'),
        limit(matchLimit)
      );
    }

    const unsubscribeMatches = onSnapshot(qMatches, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      // Memory sort by time
      matchesData.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.time || '').localeCompare(a.time || '');
      });

      setMatches(matchesData);
      
      // Fetch only involved players
      const involvedPlayerIds = new Set<string>();
      matchesData.forEach(m => {
        [...(m.teamA || []), ...(m.teamB || []), ...(m.substitutesA || []), ...(m.substitutesB || [])].forEach(id => {
          if (id) involvedPlayerIds.add(id);
        });
        if (m.mvpId) involvedPlayerIds.add(m.mvpId);
      });

      if (involvedPlayerIds.size > 0) {
        const playerIdsArray = Array.from(involvedPlayerIds);
        const playersData: Player[] = [];
        
        // Firestore 'in' query supports max 30 items
        for (let i = 0; i < playerIdsArray.length; i += 30) {
          const chunk = playerIdsArray.slice(i, i + 30);
          const q = query(collection(db, 'players'), where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          playersData.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
        }
        setPlayers(playersData);
      }
      setLoading(false);
    }, async (err) => {
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
        console.warn("Match History query failed due to missing index. Falling back to unordered query.");
        const qFallback = query(collection(db, 'matches'), limit(matchLimit));
        const snap = await getDocs(qFallback);
        setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
        setLoading(false);
      } else {
        handleFirestoreError(err, OperationType.LIST, 'matches');
      }
    });

    return () => {
      unsubscribeMatches();
    };
  }, [adminData, matchLimit]);

  const getLocationName = (locId: string) => {
    const loc = sharedLocations.find(l => l.id === locId);
    return loc ? loc.name : 'Local não definido';
  };

  const getPlayerEventsText = (eList: any[], teamPlayerIds: string[]) => {
    const playerGroups: { [playerId: string]: { goals: number, assists: number } } = {};
    const effectiveTeamIds = teamPlayerIds || [];
    
    (eList || []).forEach(e => {
      if (!e.playerId) return;
      if (effectiveTeamIds.includes(e.playerId) || e.playerId === 'unidentified_A' || e.playerId === 'unidentified_B') {
        const key = e.playerId;
        if (!playerGroups[key]) {
          playerGroups[key] = { goals: 0, assists: 0 };
        }
        if (e.type === 'goal') {
          playerGroups[key].goals++;
        } else if (e.type === 'assist') {
          playerGroups[key].assists++;
        }
      }
    });

    return Object.entries(playerGroups).map(([pid, stats]) => {
      if (pid === 'unidentified_A' || pid === 'unidentified_B') {
        return {
          player: { id: pid, name: 'Anônimo', nickname: 'Anônimo' } as any,
          goals: stats.goals,
          assists: stats.assists,
        };
      }
      const p = players.find(x => x.id === pid);
      if (!p) return null;
      return {
        player: p,
        goals: stats.goals,
        assists: stats.assists,
      };
    }).filter(Boolean);
  };

  if (loading) return null;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-3 bg-white border border-gray-100 rounded-2xl text-primary-blue hover:bg-primary-blue hover:text-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight text-primary-gray">
              Histórico de Partidas
            </h2>
            <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-widest mt-1">
              {matches.length} partidas registradas
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matches.map((match, idx) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={match.id} 
            className="bg-app-card rounded-3xl border border-gray-100 overflow-hidden hover:border-primary-blue/30 transition-all group shadow-sm hover:shadow-md"
          >
            <div className="flex flex-row">
              {/* Location Logo - Left Side */}
              {(() => {
                const loc = sharedLocations.find(l => l.id === match.locationId);
                return loc?.logoUrl ? (
                  <div className="w-16 md:w-24 bg-gray-50 flex items-center justify-center p-2 border-r border-gray-100 flex-shrink-0">
                    <img src={loc.logoUrl} alt="" className="w-full h-full object-contain" />
                  </div>
                ) : null;
              })()}

              <div className="flex-1 min-w-0">
                {/* Match Header */}
                <div className="bg-gray-50 px-5 py-3 flex items-center justify-between text-[10px] uppercase tracking-widest font-black text-gray-400 border-b border-gray-100">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3 h-3 text-primary-blue flex-shrink-0" /> 
                      <span className="truncate">{getLocationName(match.locationId)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <CalendarIcon className="w-3 h-3 text-primary-blue" /> 
                      {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] ${
                    match.status === 'finished' ? 'bg-gray-200 text-gray-600' : 
                    match.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 
                    'bg-primary-blue/10 text-primary-blue'
                  }`}>
                    {match.status === 'finished' ? 'Fim' : match.status === 'live' ? 'VIVO' : 'Agend'}
                  </span>
                </div>

                {/* Scoreboard Area */}
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-center min-w-0">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10">
                          <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} />
                        </div>
                        <div className="text-sm font-black uppercase tracking-tight text-primary-blue truncate w-full px-2">
                          {teams.find(t => t.id === match.teamAId)?.name || 'Time A'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 px-4 flex-shrink-0">
                      <div className="text-4xl font-black italic text-primary-blue tabular-nums">{match.scoreA}</div>
                      <div className="text-[10px] font-black text-primary-yellow opacity-30 italic">X</div>
                      <div className="text-4xl font-black italic text-primary-blue tabular-nums">{match.scoreB}</div>
                    </div>

                    <div className="flex-1 text-center min-w-0">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10">
                          <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} />
                        </div>
                        <div className="text-sm font-black uppercase tracking-tight text-primary-blue truncate w-full px-2">
                          {teams.find(t => t.id === match.teamBId)?.name || 'Time B'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scorers / Eventos Area */}
                  {((match.events || []).length > 0 || match.mvpId) && (
                    <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        {/* Team A Scorers */}
                        <div className="flex flex-col items-center gap-1.5 border-r border-gray-100 pr-2">
                          {getPlayerEventsText(match.events || [], match.teamA || []).map((item, idy) => {
                            if (!item) return null;
                            const isClickable = item.player.id !== 'unidentified_A' && item.player.id !== 'unidentified_B';
                            return (
                              <button
                                key={idy}
                                disabled={!isClickable}
                                onClick={(e) => {
                                  if (isClickable) {
                                    e.stopPropagation();
                                    setSelectedPlayer(item.player);
                                  }
                                }}
                                className={`text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-1 rounded-xl transition-all flex items-center gap-1 bg-gray-50 border border-gray-100 ${
                                  isClickable 
                                    ? 'text-primary-blue hover:text-primary-yellow hover:bg-primary-blue/5 hover:border-primary-blue/20 cursor-pointer active:scale-95' 
                                    : 'text-gray-400 cursor-default'
                                }`}
                              >
                                <span>{item.player.nickname || item.player.name}</span>
                                <span className="text-[8px] text-gray-400 font-bold">
                                  ({item.goals > 0 ? `${item.goals}G` : ''}{item.goals > 0 && item.assists > 0 ? ' • ' : ''}{item.assists > 0 ? `${item.assists}A` : ''})
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Team B Scorers */}
                        <div className="flex flex-col items-center gap-1.5 pl-2">
                          {getPlayerEventsText(match.events || [], match.teamB || []).map((item, idy) => {
                            if (!item) return null;
                            const isClickable = item.player.id !== 'unidentified_A' && item.player.id !== 'unidentified_B';
                            return (
                              <button
                                key={idy}
                                disabled={!isClickable}
                                onClick={(e) => {
                                  if (isClickable) {
                                    e.stopPropagation();
                                    setSelectedPlayer(item.player);
                                  }
                                }}
                                className={`text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-1 rounded-xl transition-all flex items-center gap-1 bg-gray-50 border border-gray-100 ${
                                  isClickable 
                                    ? 'text-primary-blue hover:text-primary-yellow hover:bg-primary-blue/5 hover:border-primary-blue/20 cursor-pointer active:scale-95' 
                                    : 'text-gray-400 cursor-default'
                                }`}
                              >
                                <span>{item.player.nickname || item.player.name}</span>
                                <span className="text-[8px] text-gray-400 font-bold">
                                  ({item.goals > 0 ? `${item.goals}G` : ''}{item.goals > 0 && item.assists > 0 ? ' • ' : ''}{item.assists > 0 ? `${item.assists}A` : ''})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* MVP of Match */}
                      {(() => {
                        const mvpPlayer = players.find(p => p.id === match.mvpId);
                        if (!mvpPlayer) return null;
                        return (
                          <div className="flex justify-center mt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlayer(mvpPlayer);
                              }}
                              className="text-[9px] font-black uppercase tracking-widest text-amber-800 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 px-3 py-1 rounded-full border border-amber-200/50 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              👑 MVP: {mvpPlayer.nickname || mvpPlayer.name}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
              </div>
            </div>
          </div>
        </motion.div>
        ))}
      </div>

      {matches.length >= matchLimit && (
        <div className="flex justify-center mt-8">
          <button 
            onClick={() => setMatchLimit(prev => prev + 30)}
            className="bg-white border-2 border-primary-blue text-primary-blue px-8 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all shadow-sm"
          >
            Carregar Mais Partidas
          </button>
        </div>
      )}

      {/* Player Details Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerSummaryModal 
            player={selectedPlayer}
            matches={matches}
            scoringRules={scoringRules}
            isAdminView={!!adminData}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
