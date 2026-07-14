import React, { useState, useEffect } from 'react';
import { Player, Match, ScoringRules, Card } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Trophy, ChevronDown, ChevronUp, Star, Target, HandHelping, Shield, TrendingUp, Info, AlertTriangle, CalendarDays, Mail, Edit2, Trash2, Check, Phone } from 'lucide-react';
import { SoccerBall, SoccerCleat, GoalkeeperGlove, PenaltyMissIcon } from './Icons';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { calculateGrade } from '../utils/gradeUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

interface PlayerSummaryModalProps {
  player: Player;
  matches?: Match[];
  scoringRules: ScoringRules | null;
  availableCards?: Card[];
  isAdminView?: boolean;
  onClose: () => void;
}

export function PlayerSummaryModal({ player, matches: initialMatches, scoringRules, availableCards, isAdminView, onClose }: PlayerSummaryModalProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>(initialMatches || []);
  const [localCards, setLocalCards] = useState<Card[]>(availableCards || []);
  const [locations, setLocations] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [locationPlayers, setLocationPlayers] = useState<Player[]>([]);
  const [showCardInfo, setShowCardInfo] = useState(false);

  const [localGmail, setLocalGmail] = useState(player.gmail || '');
  const [isEditingGmail, setIsEditingGmail] = useState(false);
  const [isSavingGmail, setIsSavingGmail] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  useEffect(() => {
    setLocalGmail(player.gmail || '');
  }, [player.gmail]);

  const handleSaveGmail = async () => {
    setGmailError(null);
    setIsSavingGmail(true);
    try {
      const emailValue = localGmail.toLowerCase().trim() || null;
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { gmail: emailValue });
      setIsEditingGmail(false);
      player.gmail = emailValue || undefined;
    } catch (err: any) {
      console.error("Failed to update gmail:", err);
      setGmailError(err.message || "Erro ao salvar e-mail.");
    } finally {
      setIsSavingGmail(false);
    }
  };

  const handleDeleteGmail = async () => {
    if (window.confirm("Deseja realmente remover o Gmail deste atleta?")) {
      setGmailError(null);
      setIsSavingGmail(true);
      try {
        const playerRef = doc(db, 'players', player.id);
        await updateDoc(playerRef, { gmail: null });
        setLocalGmail('');
        setIsEditingGmail(false);
        player.gmail = undefined;
      } catch (err: any) {
        console.error("Failed to delete gmail:", err);
        setGmailError(err.message || "Erro ao excluir e-mail.");
      } finally {
        setIsSavingGmail(false);
      }
    }
  };

  const [localBirthDate, setLocalBirthDate] = useState(player.birthDate || '');
  const [isEditingBirthDate, setIsEditingBirthDate] = useState(false);
  const [isSavingBirthDate, setIsSavingBirthDate] = useState(false);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);

  const [localPhone, setLocalPhone] = useState(player.phone || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    setLocalBirthDate(player.birthDate || '');
  }, [player.birthDate]);

  useEffect(() => {
    setLocalPhone(player.phone || '');
  }, [player.phone]);

  const handleSaveBirthDate = async () => {
    setBirthDateError(null);
    setIsSavingBirthDate(true);
    try {
      const birthDateValue = localBirthDate || '';
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { birthDate: birthDateValue });
      setIsEditingBirthDate(false);
      player.birthDate = birthDateValue;
    } catch (err: any) {
      console.error("Failed to update birthDate:", err);
      setBirthDateError(err.message || "Erro ao salvar data de nascimento.");
    } finally {
      setIsSavingBirthDate(false);
    }
  };

  const handleSavePhone = async () => {
    setPhoneError(null);
    setIsSavingPhone(true);
    try {
      const phoneValue = localPhone || '';
      const playerRef = doc(db, 'players', player.id);
      await updateDoc(playerRef, { phone: phoneValue });
      setIsEditingPhone(false);
      player.phone = phoneValue;
    } catch (err: any) {
      console.error("Failed to update phone:", err);
      setPhoneError(err.message || "Erro ao salvar telefone.");
    } finally {
      setIsSavingPhone(false);
    }
  };

  const currentUserEmail = auth.currentUser?.email?.toLowerCase()?.trim();
  const isLinkedPlayer = !!(currentUserEmail && player.gmail && currentUserEmail === player.gmail.toLowerCase().trim());

  useEffect(() => {
    const qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(qMatches, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(list);
    }, (err) => {
      console.error("Error loading matches inside modal:", err);
    });

    return () => unsubscribe();
  }, [player.id]);

  useEffect(() => {
    if (availableCards && availableCards.length > 0) {
      setLocalCards(availableCards);
      return;
    }
    const qCards = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qCards, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card));
      setLocalCards(list);
    }, (err) => {
      console.error("Error loading cards inside modal dynamically:", err);
    });

    return () => unsubscribe();
  }, [availableCards]);

  useEffect(() => {
    const qLocs = collection(db, 'locations');
    const unsubscribe = onSnapshot(qLocs, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLocations(list);
    }, (err) => {
      console.error("Error loading locations inside modal:", err);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qPlayers = collection(db, 'players');
    const unsubscribe = onSnapshot(qPlayers, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setLocationPlayers(list);
    }, (err) => {
      console.error("Error loading players inside modal:", err);
    });
    return () => unsubscribe();
  }, []);

  if (!scoringRules) return null;

  // 1. Sort all finished matches chronologically (oldest to newest)
  const finishedMatches = [...matches]
    .filter(m => m.status === 'finished')
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) return a.createdAt - b.createdAt;
      const dA = new Date(`${a.date || '1970-01-01'}T${a.time || '00:00'}`).getTime();
      const dB = new Date(`${b.date || '1970-01-01'}T${b.time || '00:00'}`).getTime();
      return dA - dB;
    });

  // 2. Track consecutive misses and record penalties
  const penaltyEvents: any[] = [];
  let hasPlayed = false;
  let consecutiveMisses = 0;
  let penaltiesAppliedCount = 0;

  finishedMatches.forEach((match, index) => {
    const allInvolvedPlayerIds = [
      ...new Set([
        ...(match.teamA || []),
        ...(match.teamB || []),
        ...(match.substitutesA || []),
        ...(match.substitutesB || []),
        ...(match.confirmedPlayers || [])
      ])
    ];

    const isPlayerInvolved = allInvolvedPlayerIds.includes(player.id);

    if (isPlayerInvolved) {
      hasPlayed = true;
      consecutiveMisses = 0;
    } else if (hasPlayed) {
      if (player.locationId === match.locationId || !player.locationId) {
        consecutiveMisses++;
        if (consecutiveMisses === 10) {
          penaltiesAppliedCount++;
          
          const loc = locations.find(l => l.id === match.locationId);
          const locationName = loc?.name || 'ACS';
          
          penaltyEvents.push({
            type: 'penalty',
            id: `penalty_${match.id}_${penaltiesAppliedCount}`,
            date: match.date,
            points: -5,
            locationName,
            sequenceIndex: index + 0.5
          });
          consecutiveMisses = 0;
        }
      }
    }
  });

  const playerMatches = matches.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
  
  let totalGoals = 0;
  let totalAssists = 0;
  let totalVictories = 0;
  let totalMVPs = 0;
  
  const playedHistoryItems = playerMatches.map(match => {
    const pointsResults = calculateMatchPoints(match, match.scoreA, match.scoreB, match.events || [], match.mvpId, [player], scoringRules);
    const pPointsResult = pointsResults.find(p => p.playerId === player.id);
    const mGoals = (match.events || []).filter(e => e.playerId === player.id && e.type === 'goal').length;
    const mAssists = (match.events || []).filter(e => e.playerId === player.id && e.type === 'assist').length;
    
    totalGoals += mGoals;
    totalAssists += mAssists;
    
    const isTeamA = match.teamA.includes(player.id);
    const didWin = (isTeamA && match.scoreA > match.scoreB) || (!isTeamA && match.scoreB > match.scoreA);
    if (didWin) totalVictories += 1;
    if (match.mvpId === player.id) totalMVPs += 1;

    const matchIndex = finishedMatches.findIndex(m => m.id === match.id);
    
    return { 
      type: 'match',
      id: match.id,
      date: match.date,
      match, 
      points: pPointsResult?.points || 0, 
      goals: mGoals, 
      assists: mAssists,
      breakdown: pPointsResult?.breakdown,
      sequenceIndex: matchIndex !== -1 ? matchIndex : Number.MAX_SAFE_INTEGER
    };
  });

  const matchHistory = [...playedHistoryItems, ...penaltyEvents].sort((a, b) => b.sequenceIndex - a.sequenceIndex);

  // Calculate local statistics & ranking
  const locationMatches = matches.filter(m => m.locationId === player.locationId && m.status === 'finished');
  const playersStatsMap = new Map<string, { wins: number; draws: number; matches: number }>();

  locationMatches.forEach(match => {
    const winner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];

    teamA.forEach(pid => {
      if (!playersStatsMap.has(pid)) {
        playersStatsMap.set(pid, { wins: 0, draws: 0, matches: 0 });
      }
      const st = playersStatsMap.get(pid)!;
      st.matches++;
      if (winner === 'A') {
        st.wins++;
      } else if (winner === 'draw') {
        st.draws++;
      }
    });

    teamB.forEach(pid => {
      if (!playersStatsMap.has(pid)) {
        playersStatsMap.set(pid, { wins: 0, draws: 0, matches: 0 });
      }
      const st = playersStatsMap.get(pid)!;
      st.matches++;
      if (winner === 'B') {
        st.wins++;
      } else if (winner === 'draw') {
        st.draws++;
      }
    });
  });

  const playersWithAproveitamento = locationPlayers
    .filter(p => p.locationId === player.locationId)
    .map(p => {
      const st = playersStatsMap.get(p.id) || { wins: 0, draws: 0, matches: 0 };
      const wins = st.wins;
      const draws = st.draws;
      const losses = st.matches - wins - draws;
      const aproveitamento = st.matches > 0 ? ((wins * 3) + draws) / (st.matches * 3) : 0;
      return {
        id: p.id,
        matches: st.matches,
        wins,
        draws,
        losses,
        aproveitamento
      };
    });

  const rankedPlayers = [...playersWithAproveitamento]
    .filter(p => p.matches > 0)
    .sort((a, b) => {
      if (b.aproveitamento !== a.aproveitamento) {
        return b.aproveitamento - a.aproveitamento;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return b.matches - a.matches;
    });

  const playerRankIndex = rankedPlayers.findIndex(p => p.id === player.id);
  const playerRank = playerRankIndex !== -1 ? playerRankIndex + 1 : null;
  const totalRanked = rankedPlayers.length;

  const currentLocStats = playersWithAproveitamento.find(p => p.id === player.id) || {
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    aproveitamento: 0
  };

  const formatBirthDate = (dateStr?: string) => {
    if (!dateStr) return 'Não informada';
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const calculateAge = (dateStr?: string) => {
    if (!dateStr) return 'Não informada';
    try {
      const birthDate = new Date(dateStr + 'T00:00:00');
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return `${age} anos`;
    } catch (e) {
      return 'Não informada';
    }
  };

  const avgPoints = (player.stats.points || 0) / (player.stats.matches || 1);
  const playerGrade = calculateGrade(player.overallStats, avgPoints);
  const baseGradeNum = parseInt(playerGrade.grade) || 75;

  let finalOverall = baseGradeNum;
  let finalFontColor = '#a52a2a';
  let resolvedCard: Card | undefined = undefined;

  if (localCards && localCards.length > 0) {
    let assignedCard = localCards.find(c => c.imageUrl === player.cardBgUrl) || localCards.find(c => c.isDefault);
    
    // Check card expiration
    if (assignedCard && assignedCard.expirationDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (assignedCard.expirationDate < todayStr) {
        assignedCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
      }
    }

    const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
    const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);

    const rawOverallWithBonus = Math.min(105, baseGradeNum + cardBonusValue);

    const silverCard = localCards.find(c => {
      const n = c.name?.toUpperCase() || '';
      return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
    });
    const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

    resolvedCard = forceSilver ? silverCard! : assignedCard;
    if (resolvedCard) {
      finalFontColor = resolvedCard.fontColor || '#a52a2a';
      const resolvedIsArtilheiro = resolvedCard.name?.toUpperCase()?.includes('ARTILHEIRO');
      const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard.increaseOverall || 0);
      finalOverall = Math.min(105, baseGradeNum + resolvedBonus);
    }
  } else {
    finalOverall = player.overallValue || baseGradeNum;
  }

  const bgImage = resolvedCard?.imageUrl || player.cardBgUrl || localCards?.find(c => c.name.toUpperCase() === 'GERAL')?.imageUrl;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative bg-white w-full max-w-lg rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header with FIFA style card */}
        <div className="relative bg-primary-blue p-8 pb-12">
          {/* Abstract background shapes wrapped to avoid overflow */}
          <div className="absolute inset-0 overflow-hidden rounded-t-[2.5rem] pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-yellow/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />
          </div>
          
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-6">
              {/* FIFA Card Visualization */}
              <div className="relative group filter drop-shadow-md hover:drop-shadow-lg transition-all translate-y-12 z-30">
                <div 
                  className="w-28 md:w-32 aspect-[3/4] relative transition-transform duration-500 hover:scale-[1.05]"
                  style={{
                    backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                    backgroundColor: !bgImage ? '#1e293b' : 'transparent',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                  }}
                >
                  {/* Rating and Position on the left (Percentage aligned) */}
                  <div className="absolute left-[calc(8%+10px)] top-[19%] flex flex-col items-center select-none z-10" style={{ color: finalFontColor }}>
                    <span className="text-[1.3rem] md:text-[1.6rem] font-black italic leading-none">
                      {finalOverall.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[7.5px] md:text-[9.5px] font-black uppercase mt-0.5 sm:mt-1 bg-amber-950/15 px-1 py-0.5 rounded tracking-wider">
                      {(player.position || '').slice(0, 3).toUpperCase()}
                    </span>
                  </div>

                  {/* Player Photo (Perfect shield and cutout alignment) */}
                  <div className="absolute right-[calc(3%+5px)] top-[13.875%] w-[71.5%] aspect-square pointer-events-none z-20">
                    {player.photoUrl ? (
                      <img 
                      src={player.photoUrl} 
                      alt="" 
                      referrerPolicy="no-referrer"
                      className="w-full h-full rounded-none object-cover shadow-sm bg-transparent" 
                    />
                  ) : (
                    <div className="w-full h-full rounded-none bg-amber-950/10 flex items-center justify-center shadow-sm">
                      <User className="w-[35%] h-[35%] text-amber-950/20" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Player Info */}
            <div className="text-white max-w-[55%]">
              <div className="inline-block bg-primary-yellow text-primary-blue text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 shadow-lg">
                {player.position || 'Jogador'}
              </div>
              <h3 className="text-xl md:text-3xl font-black uppercase italic tracking-tighter leading-none mb-2 break-words">
                {player.nickname || player.name}
              </h3>
              <div className="flex flex-col gap-1.5 mt-2">
                {isEditingBirthDate ? (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[9px] text-primary-yellow font-black uppercase tracking-wider">Alterar Nasc.:</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="date"
                        value={localBirthDate}
                        onChange={(e) => setLocalBirthDate(e.target.value)}
                        className="bg-white/15 border border-white/20 rounded-xl py-1 px-2.5 text-xs outline-none text-white font-bold focus:ring-2 focus:ring-primary-yellow/40 transition-all"
                      />
                      <button
                        onClick={handleSaveBirthDate}
                        disabled={isSavingBirthDate}
                        className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all shadow-sm flex items-center justify-center disabled:opacity-50 cursor-pointer"
                        title="Salvar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingBirthDate(false);
                          setLocalBirthDate(player.birthDate || '');
                          setBirthDateError(null);
                        }}
                        disabled={isSavingBirthDate}
                        className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all shadow-sm cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {birthDateError && (
                      <span className="text-[10px] font-semibold text-red-300">{birthDateError}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-white/90">
                    <CalendarDays className="w-3.5 h-3.5 text-primary-yellow flex-shrink-0" />
                    <span className="truncate flex items-center gap-1">
                      Idade: <strong className="font-extrabold text-white">{calculateAge(player.birthDate)}</strong>
                      {player.birthDate && (
                        <span className="text-white/60 font-medium"> ({formatBirthDate(player.birthDate)})</span>
                      )}
                    </span>
                    {(isLinkedPlayer || isAdminView) && (
                      <button
                        onClick={() => setIsEditingBirthDate(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Data de Nascimento"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {(isLinkedPlayer || isAdminView) && (
                  isEditingPhone ? (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[9px] text-primary-yellow font-black uppercase tracking-wider">Alterar Telefone:</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text"
                        placeholder="Telefone ou WhatsApp"
                        value={localPhone}
                        onChange={(e) => setLocalPhone(e.target.value)}
                        className="bg-white/15 border border-white/20 rounded-xl py-1 px-2.5 text-xs outline-none text-white font-bold focus:ring-2 focus:ring-primary-yellow/40 transition-all w-36"
                      />
                      <button
                        onClick={handleSavePhone}
                        disabled={isSavingPhone}
                        className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all shadow-sm flex items-center justify-center disabled:opacity-50 cursor-pointer"
                        title="Salvar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingPhone(false);
                          setLocalPhone(player.phone || '');
                          setPhoneError(null);
                        }}
                        disabled={isSavingPhone}
                        className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all shadow-sm cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {phoneError && (
                      <span className="text-[10px] font-semibold text-red-300">{phoneError}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-white/90">
                    <Phone className="w-3.5 h-3.5 text-primary-yellow flex-shrink-0" />
                    <span className="truncate flex items-center gap-1">
                      Tel: <strong className="font-extrabold text-white">{player.phone || 'Não cadastrado'}</strong>
                    </span>
                    <button
                        onClick={() => setIsEditingPhone(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Telefone"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 text-[10.5px] font-bold text-white/70">
                  <span className="uppercase tracking-wider text-[9px] font-black opacity-60">Partidas Gerais:</span>
                  <strong className="text-sm font-black text-white italic">{player.stats.matches}</strong>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="absolute top-0 right-0 p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-white backdrop-blur-md active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 p-6 pt-5 overflow-y-auto space-y-4 bg-white -mt-6 rounded-t-[2.5rem] relative z-20">
          {/* Admin Area - Gmail Field */}
          {isAdminView && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-4 flex flex-col relative overflow-hidden transition-all mb-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="bg-primary-blue/10 p-2.5 rounded-2xl text-primary-blue flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary-blue/60 block">Acesso do Atleta (Gmail)</span>
                    {!isEditingGmail ? (
                      <span className="text-sm font-bold text-gray-700 block truncate pr-2">
                        {player.gmail || <span className="text-gray-400 italic font-medium">Nenhum Gmail associado</span>}
                      </span>
                    ) : (
                      <input 
                        type="email"
                        value={localGmail}
                        onChange={(e) => setLocalGmail(e.target.value)}
                        placeholder="atleta@gmail.com"
                        className="mt-1 bg-white border border-gray-200 rounded-xl py-1.5 px-3 text-sm outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue/30 transition-all font-medium text-gray-700 w-full"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isEditingGmail ? (
                    <>
                      <button
                        onClick={() => setIsEditingGmail(true)}
                        className="p-2 bg-white hover:bg-gray-50 text-gray-500 hover:text-primary-blue border border-gray-100 hover:border-gray-200 rounded-xl transition-all shadow-sm cursor-pointer"
                        title="Editar Gmail"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {player.gmail && (
                        <button
                          onClick={handleDeleteGmail}
                          className="p-2 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white border border-red-100/50 hover:border-red-500 rounded-xl transition-all shadow-sm cursor-pointer"
                          title="Remover Gmail"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveGmail}
                        disabled={isSavingGmail}
                        className="p-2 bg-primary-blue hover:bg-blue-600 text-white rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center disabled:opacity-50"
                        title="Salvar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingGmail(false);
                          setLocalGmail(player.gmail || '');
                          setGmailError(null);
                        }}
                        disabled={isSavingGmail}
                        className="p-2 bg-white hover:bg-gray-50 text-gray-400 border border-gray-100 rounded-xl transition-all shadow-sm cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {gmailError && (
                <p className="mt-2 text-xs font-semibold text-red-500 bg-red-50/50 p-2 rounded-xl border border-red-100">
                  {gmailError}
                </p>
              )}
            </div>
          )}

          {/* Card Info Banner if active & custom */}
          {resolvedCard && !resolvedCard.isDefault && resolvedCard.name.toUpperCase() !== 'GERAL' && resolvedCard.name.toUpperCase() !== 'PRATA' && !resolvedCard.name.toUpperCase().includes('PRATA') && (
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 flex flex-col relative overflow-hidden transition-all">
              <button 
                onClick={() => setShowCardInfo(!showCardInfo)}
                className="w-full flex items-center justify-between text-left focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute flex h-3.5 w-3.5 rounded-full bg-emerald-500/20 animate-ping" />
                    <span className="relative flex h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Carta Especial Ativa</span>
                    <span className="text-sm font-black uppercase text-primary-blue flex items-center gap-1.5">
                      {resolvedCard.name}
                      {resolvedCard.increaseOverall && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-md">
                          +{resolvedCard.increaseOverall} OVR
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {showCardInfo ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showCardInfo && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 mt-3 border-t border-slate-100 space-y-3">
                      {resolvedCard.description && (
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          <span className="font-extrabold text-slate-700 block text-[10px] uppercase tracking-wider mb-0.5">Como conquistar:</span>
                          {resolvedCard.description}
                        </p>
                      )}

                      {resolvedCard.expirationDate && (
                        <div className="flex items-center gap-1.5 text-[10.5px] text-red-600 bg-red-50 border border-red-100/60 px-3 py-1.5 rounded-2xl font-bold w-fit">
                          <span>Expira em: {resolvedCard.expirationDate.split('-').reverse().join('/')}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-3 md:gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalGoals}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Gols</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalAssists}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Assists</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalVictories}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Vitórias</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-yellow group-hover:scale-110 transition-transform">{totalMVPs}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">MVP</div>
            </div>
          </div>

          {/* Aproveitamento, Relação de Jogos e Ranking */}
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Estatísticas & Aproveitamento do Local
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {/* Jogos Realizados e Aproveitamento */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest block mb-1">Aproveitamento</span>
                  <span className="text-2xl font-black text-emerald-600">{(currentLocStats.aproveitamento * 100).toFixed(1)}%</span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-50 text-[11px] font-bold text-gray-500 flex flex-col gap-1">
                  <span>Jogos no Local: <strong className="text-slate-800 font-extrabold">{currentLocStats.matches}</strong></span>
                  <span className="text-[10px] text-gray-400">({currentLocStats.wins}V • {currentLocStats.draws}E • {currentLocStats.losses}D)</span>
                </div>
              </div>

              {/* Ranking no Local */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest block mb-1">Ranking do Local</span>
                  <span className="text-2xl font-black text-primary-blue flex items-baseline gap-0.5">
                    {playerRank !== null ? (
                      <>
                        {playerRank}
                        <span className="text-xs font-black">º</span>
                      </>
                    ) : (
                      <span className="text-sm font-black text-gray-400">Sem Rank</span>
                    )}
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-50 text-[11px] font-bold text-gray-500">
                  {playerRank !== null ? (
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500 animate-bounce" />
                      <span>de {totalRanked} atletas ativos</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">Nenhum jogo concluído</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Histórico de Atuações Button */}
          <div className="space-y-4">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100/80 rounded-2xl transition-all active:scale-[0.99] group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-blue/5 rounded-xl text-primary-blue group-hover:bg-primary-blue/10 transition-colors">
                  <Star className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-primary-blue block">Histórico de Atuações</span>
                  <span className="text-[10px] text-gray-400 font-bold">Clique para expandir/recolher histórico completo</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-primary-blue/5 text-primary-blue px-2.5 py-1 rounded-xl">
                  {matchHistory.length} partidas
                </span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-primary-blue transition-colors" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-primary-blue transition-colors" />
                )}
              </div>
            </button>

            {showHistory && (
              <div className="pt-2">
                <h4 className="text-xs font-black uppercase tracking-widest mb-4 text-primary-blue italic pl-1">Detalhes das Atuações</h4>
                <div className="space-y-2">
                  {matchHistory.map((item) => {
                    if (item.type === 'penalty') {
                      const isExpanded = expandedId === item.id;
                      return (
                        <div key={item.id} className="overflow-hidden">
                          <button 
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl text-xs border transition-all ${
                              isExpanded 
                                ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-red-100' 
                                : 'bg-red-50 text-red-700 border-red-100 hover:border-red-200'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <span className={`font-bold ${isExpanded ? 'text-white/60' : 'text-red-400'}`}>
                                {format(new Date(item.date + 'T00:00:00'), 'dd/MM')}
                              </span>
                              
                              <div className="flex items-center gap-2">
                                <span className="bg-red-100 text-red-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                                  PUNIÇÃO
                                </span>
                                <span className="font-black uppercase tracking-tight text-left line-clamp-1">
                                  Ausência (10 jogos seguidos)
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <span className={`font-black ${isExpanded ? 'text-white' : 'text-red-600'}`}>
                                -5 pts
                              </span>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="px-2"
                              >
                                <div className="bg-white border-x border-b border-red-100 rounded-b-2xl p-4 space-y-2 shadow-inner text-[11px]">
                                  <p className="font-medium text-gray-600">
                                    Este atleta foi punido com a perda de <strong className="text-red-600 font-extrabold">-5 pontos</strong> por completar um ciclo de <strong className="font-bold">10 partidas consecutivas</strong> sem participar de nenhum jogo no seu local de origem ({item.locationName}).
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-mono">
                                    Data de referência: {format(new Date(item.date + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    const isExpanded = expandedId === item.id;
                    
                    return (
                      <div key={item.id} className="overflow-hidden">
                        <button 
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl text-xs border transition-all ${
                            isExpanded 
                              ? 'bg-primary-blue text-white border-primary-blue shadow-lg shadow-blue-100' 
                              : 'bg-gray-50 text-primary-gray border-gray-100 hover:border-primary-blue/20'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`font-bold ${isExpanded ? 'text-white/60' : 'text-gray-400'}`}>
                              {format(new Date(item.date + 'T00:00:00'), 'dd/MM')}
                            </span>
                            
                            {/* Match Result and Score */}
                            {(() => {
                              const isTeamA = item.match.teamA.includes(player.id);
                              const athleteScore = isTeamA ? (item.match.scoreA ?? 0) : (item.match.scoreB ?? 0);
                              const opponentScore = isTeamA ? (item.match.scoreB ?? 0) : (item.match.scoreA ?? 0);
                              const resultColor = athleteScore > opponentScore 
                                ? (isExpanded ? 'text-emerald-300' : 'text-emerald-600') 
                                : (athleteScore < opponentScore 
                                    ? (isExpanded ? 'text-rose-300' : 'text-rose-600') 
                                    : (isExpanded ? 'text-gray-300' : 'text-gray-500'));
                              
                              return (
                                <span className={`font-black ${resultColor} flex items-center gap-1`}>
                                  <span className="text-xl">{athleteScore}</span>
                                  <span className="text-[10px] font-bold opacity-70">x</span>
                                  <span className="text-xs">{opponentScore}</span>
                                </span>
                              );
                            })()}

                            <div className="flex items-center gap-2">
                              <span className="font-black uppercase italic tracking-tight truncate max-w-[100px]">
                                {item.goals}G • {item.assists}A
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <span className={`font-black ${isExpanded ? 'text-white' : 'text-primary-blue'}`}>
                              {item.points > 0 ? `+${item.points}` : item.points} pts
                            </span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && item.breakdown && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="px-2"
                            >
                              <div className="bg-white border-x border-b border-gray-100 rounded-b-2xl p-4 space-y-3 shadow-inner">
                                <div className="grid grid-cols-2 gap-2">
                                  {item.breakdown.result !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <Trophy size={12} className="text-yellow-500" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Resultado</span>
                                      </div>
                                      <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.result}</span>
                                    </div>
                                  )}
                                  {item.breakdown.goals !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <SoccerBall className="w-3 h-3 text-primary-blue" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Gols ({item.breakdown.goalsCount})</span>
                                      </div>
                                      <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.goals}</span>
                                    </div>
                                  )}
                                  {item.breakdown.assists !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <SoccerCleat className="w-3 h-3 text-primary-blue" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Assists ({item.breakdown.assistsCount})</span>
                                      </div>
                                      <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.assists}</span>
                                    </div>
                                  )}
                                  {item.breakdown.cleanSheet !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <Shield size={12} className="text-cyan-500" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Clean Sheet</span>
                                      </div>
                                      <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.cleanSheet}</span>
                                    </div>
                                  )}
                                  {item.breakdown.goalkeeperBonus !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <Target size={12} className="text-orange-500" />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Bônus Goleiro</span>
                                      </div>
                                      <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.goalkeeperBonus}</span>
                                    </div>
                                  )}
                                  {item.breakdown.penaltyMiss !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-red-50 rounded-xl border border-red-100">
                                      <div className="flex items-center gap-2">
                                        <PenaltyMissIcon size={12} className="text-[#EF4444]" />
                                        <span className="text-[10px] font-bold uppercase text-red-500">Pênalti Perdido ({item.breakdown.penaltyMissCount})</span>
                                      </div>
                                      <span className="text-[10px] font-black text-red-600">{item.breakdown.penaltyMiss}</span>
                                    </div>
                                  )}
                                  {item.breakdown.ownGoals !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-red-50 rounded-xl border border-red-100">
                                      <div className="flex items-center gap-2">
                                        <AlertTriangle size={12} className="text-red-500" />
                                        <span className="text-[10px] font-bold uppercase text-red-500">Contra ({item.breakdown.ownGoalsCount})</span>
                                      </div>
                                      <span className="text-[10px] font-black text-red-600">{item.breakdown.ownGoals}</span>
                                    </div>
                                  )}
                                  {item.breakdown.goalDifference !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                      <div className="flex items-center gap-2">
                                        <TrendingUp size={12} className={item.breakdown.goalDifference > 0 ? "text-green-500" : "text-red-500"} />
                                        <span className="text-[10px] font-bold uppercase text-gray-400">Saldo</span>
                                      </div>
                                      <span className={`text-[10px] font-black ${item.breakdown.goalDifference > 0 ? "text-primary-blue" : "text-red-500"}`}>
                                        {item.breakdown.goalDifference > 0 ? `+${item.breakdown.goalDifference}` : item.breakdown.goalDifference}
                                      </span>
                                    </div>
                                  )}
                                  {item.breakdown.mvp !== 0 && (
                                    <div className="flex items-center justify-between p-2 bg-purple-50 rounded-xl border border-purple-100">
                                      <div className="flex items-center gap-2">
                                        <Star size={12} className="text-purple-500" />
                                        <span className="text-[10px] font-bold uppercase text-purple-400 tracking-tighter">Bônus MVP</span>
                                      </div>
                                      <span className="text-[10px] font-black text-purple-600">+{item.breakdown.mvp}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
