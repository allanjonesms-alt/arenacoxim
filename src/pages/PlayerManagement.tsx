import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Player, Position, Location, OverallStats, AdminData, Match, ScoringRules, Card, MonthlyAward } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { Users, UserPlus, Trash2, Edit2, Shield, Sword, ShieldAlert, Search, X, MapPin, Zap, Heart, Dumbbell, Target, Move, Share2, BarChart3, User, Star, ShieldCheck, CheckCircle2, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';
import { calculateGrade, calculateAverage, valueToLetter, letterToValue, getGradeColor } from '../utils/gradeUtils';
import { Link } from 'react-router-dom';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlayerSummaryModal } from '../components/PlayerSummaryModal';
import { ImageCropModal } from '../components/ImageCropModal';

interface PlayerManagementProps {
  adminData?: AdminData | null;
  adminId?: string;
  sharedLocations: Location[];
}

export default function PlayerManagement({ adminData, adminId, sharedLocations }: PlayerManagementProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>(sharedLocations);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerLimit, setPlayerLimit] = useState(200);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);

  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);

  const isAdmin = adminData !== null;

  // States for Sgt Nunes direct card editing
  const [sgtNunesEditingId, setSgtNunesEditingId] = useState<string | null>(null);
  const [sgtNunesGoals, setSgtNunesGoals] = useState<number>(0);
  const [sgtNunesAssists, setSgtNunesAssists] = useState<number>(0);
  const [isSavingSgtNunes, setIsSavingSgtNunes] = useState(false);

  const isSgtNunes = (p: { name?: string; nickname?: string }) => {
    const nicknameClean = (p.nickname || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nameClean = (p.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return nicknameClean.includes('SGTNUNES') || nameClean.includes('SGTNUNES');
  };

  const startEditingSgtNunes = (e: React.MouseEvent, p: Player) => {
    e.stopPropagation();
    setSgtNunesEditingId(p.id);
    setSgtNunesGoals(p.stats?.goals || 0);
    setSgtNunesAssists(p.stats?.assists || 0);
  };

  const handleSaveSgtNunesStats = async (player: Player) => {
    setIsSavingSgtNunes(true);
    try {
      const oldGoalPts = (player.stats?.goals || 0) * (scoringRules?.goal ?? 3);
      const oldAssistPts = (player.stats?.assists || 0) * (scoringRules?.assist ?? 2);
      const otherPoints = Math.max(0, (player.stats?.points || 0) - oldGoalPts - oldAssistPts);
      const newPoints = otherPoints + (sgtNunesGoals * (scoringRules?.goal ?? 3)) + (sgtNunesAssists * (scoringRules?.assist ?? 2));

      const avgPoints = newPoints / (player.stats?.matches || 1);
      const { grade } = calculateGrade(player.overallStats || {}, avgPoints);
      const overallValue = parseInt(grade) || 75;

      await updateDoc(doc(db, 'players', player.id), {
        'stats.goals': sgtNunesGoals,
        'stats.assists': sgtNunesAssists,
        'stats.points': newPoints,
        'overallValue': overallValue
      });
      setSgtNunesEditingId(null);
    } catch (err) {
      console.error("Erro ao salvar estatísticas do SGT NUNES:", err);
      alert("Erro ao salvar as estatísticas.");
    } finally {
      setIsSavingSgtNunes(false);
    }
  };

  // Form State
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [position, setPosition] = useState<Position>('centroavante');
  const [locationId, setLocationId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [cardBgUrl, setCardBgUrl] = useState('');
  const [gmail, setGmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bettingDisabled, setBettingDisabled] = useState(false);
  const [availableCards, setAvailableCards] = useState<Card[]>([]);
  const [monthlyAwards, setMonthlyAwards] = useState<MonthlyAward[]>([]);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState('');
  const [isOverallModalOpen, setIsOverallModalOpen] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [playerToDeleteId, setPlayerToDeleteId] = useState<string | null>(null);
  const [overallStats, setOverallStats] = useState<OverallStats>({
    ratings: {}
  });

  const checkDuplicate = (nameToCheck: string, locId: string) => {
    if (!nameToCheck || !locId) {
      setDuplicateWarning(false);
      return;
    }
    const isDuplicate = players.some(p => 
      p.locationId === locId && 
      p.name.toUpperCase().trim() === nameToCheck.toUpperCase().trim() &&
      p.id !== editingPlayer?.id
    );
    setDuplicateWarning(isDuplicate);
  };

  useEffect(() => {
    let locationsList = sharedLocations;
    // Filter locations if not master admin
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      locationsList = locationsList.filter(l => l.id === adminData.locationId);
    }
    setLocations(locationsList);
  }, [sharedLocations, adminData]);

  useEffect(() => {
    let qPlayers = query(collection(db, 'players'), orderBy('overallValue', 'desc'), limit(playerLimit));
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qPlayers = query(
        collection(db, 'players'), 
        where('locationId', '==', adminData.locationId),
        orderBy('overallValue', 'desc'),
        limit(playerLimit)
      );
    }

    const unsubscribePlayers = onSnapshot(qPlayers, async (snapshot) => {
      let playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      console.log("Firestore snapshot update received:", playersList.length, "players");
      setPlayers(playersList);
      setLoadingPlayers(false);
    }, async (err) => {
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
         console.warn("Player listing query failed due to missing index. Falling back to memory filter.");
         const qFallback = query(collection(db, 'players'), orderBy('overallValue', 'desc'), limit(playerLimit));
         const snap = await getDocs(qFallback);
         let playersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
         
         if (adminData && adminData.role !== 'master' && adminData.locationId) {
           playersData = playersData.filter(p => p.locationId === adminData.locationId);
         }
         
         setPlayers(playersData);
         setLoadingPlayers(false);
      } else {
         handleFirestoreError(err, OperationType.LIST, 'players');
         setLoadingPlayers(false);
      }
    });

    return () => {
      unsubscribePlayers();
    };
  }, [adminData, playerLimit]);

  useEffect(() => {
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      setLocationId(adminData.locationId);
    }
  }, [adminData, isModalOpen]);

  useEffect(() => {
    // Listen to scoring rules
    const unsubscribeScoring = onSnapshot(doc(db, 'settings', 'scoring'), (snapshot) => {
      if (snapshot.exists()) {
        setScoringRules(snapshot.data() as ScoringRules);
      }
      setLoadingRules(false);
    }, (err) => {
      console.error("Erro ao carregar regras de pontuação:", err);
      setLoadingRules(false);
    });

    // Listen to matches
    const qMatches = query(collection(db, 'matches'), orderBy('createdAt', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(list);
      setLoadingMatches(false);
    }, (err) => {
      console.error("Erro ao carregar partidas:", err);
      setLoadingMatches(false);
    });

    // Listen to custom card backgrounds
    const qCards = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    const unsubscribeCards = onSnapshot(qCards, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card));
      setAvailableCards(list);
      setLoadingCards(false);
    }, (err) => {
      console.error("Erro ao carregar cards:", err);
      setLoadingCards(false);
    });

    // Listen to monthly awards
    const unsubscribeAwards = onSnapshot(collection(db, 'monthlyAwards'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyAward));
      setMonthlyAwards(list);
    });

    return () => {
      unsubscribeScoring();
      unsubscribeMatches();
      unsubscribeCards();
      unsubscribeAwards();
    };
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRawImageSrc(reader.result as string);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSubmit started");                
    if (!locationId) {
      alert('O local é obrigatório para o cadastro.');
      return;
    }

    const isDuplicate = players.some(p => 
      p.locationId === locationId && 
      p.name.toLowerCase().trim() === name.toLowerCase().trim() &&
      p.id !== editingPlayer?.id
    );

    if (isDuplicate) {
      alert(`Já existe um jogador cadastrado com o nome "${name}" neste local.`);
      return;
    }
    console.log("No duplicates found, proceeding to update/create");                
    const currentAdminId = auth.currentUser?.uid || 'unknown';
    const currentRating = overallStats.ratings?.[currentAdminId];
    console.log("Rating:", currentRating);                

    // Calculate overall for sorting
    const tempRatings = currentRating !== undefined 
      ? { ...(overallStats.ratings || {}), [currentAdminId]: currentRating }
      : (overallStats.ratings || {});
    const avgPoints = editingPlayer ? ((editingPlayer.stats.points || 0) / (editingPlayer.stats.matches || 1)) : 0;
    const { grade } = calculateGrade({ ratings: tempRatings }, avgPoints);
    let overallValue = parseInt(grade) || 75;
    
    // Apply card bonus
    let cardUsed = availableCards.find(c => c.imageUrl === cardBgUrl) || availableCards.find(c => c.isDefault);
    if (cardUsed && cardUsed.expirationDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (cardUsed.expirationDate < todayStr) {
        cardUsed = availableCards.find(c => c.name.toUpperCase() === 'GERAL') || availableCards.find(c => c.isDefault);
      }
    }
    const isArtilheiro = cardUsed?.name?.toUpperCase()?.includes('ARTILHEIRO');
    const bonus = isArtilheiro ? 5 : (cardUsed?.increaseOverall || 0);
    const awardsBonus = editingPlayer ? monthlyAwards.filter(a => a.playerId === editingPlayer.id).length : 0;
    overallValue = Math.min(105, overallValue + bonus + awardsBonus);
    
    console.log("Overall value calculated (including card & awards bonus):", overallValue);

    try {
      if (editingPlayer) {
        console.log("Updating player ID:", editingPlayer.id);
        console.log("Current name:", name, "nickname:", nickname, "cardBgUrl (state):", cardBgUrl);
        const updateData: any = {
          name: name.toUpperCase().trim(),
          nickname: nickname.toUpperCase().trim(),
          position,
          locationId,
          photoUrl: photoUrl || '',
          cardBgUrl: cardBgUrl || null, // Ensure we are saving something
          gmail: gmail.toLowerCase().trim() || null,
          phone: phone.trim() || null,
          overallValue: overallValue,
          birthDate: birthDate || '',
          bettingDisabled: bettingDisabled
        };
        
        // Safely update the current admin's rating
        if (currentRating !== undefined) {
          updateData.overallStats = {
            ...(editingPlayer?.overallStats || {}),
            ratings: {
              ...(editingPlayer?.overallStats?.ratings || {}),
              [currentAdminId]: currentRating
            }
          };
        }
        
        console.log("updateData to save:", updateData);
        await updateDoc(doc(db, 'players', editingPlayer.id), updateData);
        console.log("Player updated successfully in Firestore, check DB now");
      } else {
        const playerData = {
          name: name.toUpperCase().trim(),
          nickname: nickname.toUpperCase().trim(),
          position,
          locationId,
          photoUrl: photoUrl || '',
          cardBgUrl: cardBgUrl || availableCards.find(c => c.isDefault)?.imageUrl || '',
          gmail: gmail.toLowerCase().trim() || null,
          phone: phone.trim() || null,
          stats: { wins: 0, goals: 0, assists: 0, matches: 0, points: 0 },
          overallStats: {
            ratings: currentRating !== undefined ? { [currentAdminId]: currentRating } : {}
          },
          overallValue: overallValue,
          birthDate: birthDate || '',
          bettingDisabled: bettingDisabled
        };
        console.log("playerData to create:", playerData);                
        await addDoc(collection(db, 'players'), playerData);
        console.log("Player created successfully in Firestore");
      }
      console.log("Resetting form...");                
      resetForm();
      console.log("Form reset complete");                
    } catch (error) {
      console.error("Error in handleSubmit:", error);                
      handleFirestoreError(error, editingPlayer ? OperationType.UPDATE : OperationType.CREATE, 'players');
    }
  };

  const resetForm = () => {
    console.log("resetForm called");
    setName('');
    setNickname('');
    setBirthDate('');
    setPosition('centroavante');
    setLocationId(adminData && adminData.role !== 'master' && adminData.locationId ? adminData.locationId : '');
    setPhotoUrl('');
    setCardBgUrl('');
    setGmail('');
    setPhone('');
    setBettingDisabled(false);
    setEditingPlayer(null);
    setIsModalOpen(false);
    setIsOverallModalOpen(false);
    setOverallStats({
      ratings: {}
    });
  };

  const handleTogglePlayerBetting = async (e: React.MouseEvent, player: Player) => {
    e.stopPropagation();
    try {
      const newStatus = !player.bettingDisabled;
      await updateDoc(doc(db, 'players', player.id), {
        bettingDisabled: newStatus
      });
    } catch (err) {
      console.error("Erro ao alternar status de aposta:", err);
      alert("Erro ao atualizar o status de aposta.");
    }
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setName(player.name);
    setNickname(player.nickname);
    setBirthDate(player.birthDate || '');
    setPosition(player.position);
    setCardBgUrl(player.cardBgUrl || '');
    setGmail(player.gmail || '');
    setPhone(player.phone || '');
    setBettingDisabled(player.bettingDisabled || false);
    
    // Resolve locationId: if it's a name (legacy), find the ID so the dropdown selects it
    let resolvedLocId = player.locationId || '';
    const locByName = sharedLocations.find(l => 
      (l.name || '').trim().toLowerCase() === (player.locationId || '').trim().toLowerCase()
    );
    if (locByName && !locations.some(l => l.id === player.locationId)) {
      resolvedLocId = locByName.id;
    }
    
    setLocationId(resolvedLocId);
    setPhotoUrl(player.photoUrl || '');
    if (player.overallStats) {
      setOverallStats(player.overallStats);
    } else {
      setOverallStats({
        ratings: {}
      });
    }
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setPlayerToDeleteId(id);
  };

  const confirmDelete = async () => {
    if (playerToDeleteId) {
      try {
        await deleteDoc(doc(db, 'players', playerToDeleteId));
        setPlayerToDeleteId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'players');
      }
    }
  };

  const getLocationName = (locId: string) => {
    if (!locId) return 'Local';
    const loc = sharedLocations.find(l => l.id === locId);
    if (loc) return loc.name;
    
    // Fallback: check if the locId matches a location name (for legacy data)
    const normalizedLocId = (locId || '').trim().toLowerCase();
    const locByName = sharedLocations.find(l => (l.name || '').trim().toLowerCase() === normalizedLocId);
    if (locByName) return locByName.name;
    
    return 'Local';
  };

  const filteredPlayers = players
    .filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = selectedLocationId === 'all' || p.locationId === selectedLocationId;
      const matchesPosition = selectedPosition === 'all' || p.position === selectedPosition;
      return matchesSearch && matchesLocation && matchesPosition;
    })
    .sort((a, b) => {
      const avgA = (a.stats.points || 0) / (a.stats.matches || 1);
      const avgB = (b.stats.points || 0) / (b.stats.matches || 1);
      const baseA = parseInt(calculateGrade(a.overallStats, avgA).grade) || 75;
      const baseB = parseInt(calculateGrade(b.overallStats, avgB).grade) || 75;
      
      let cardA = availableCards.find(c => c.imageUrl === a.cardBgUrl) || availableCards.find(c => c.isDefault);
      if (cardA && cardA.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (cardA.expirationDate < todayStr) {
          cardA = availableCards.find(c => c.name.toUpperCase() === 'GERAL') || availableCards.find(c => c.isDefault);
        }
      }
      const isArtilheiroA = cardA?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const bonusA = isArtilheiroA ? 5 : (cardA?.increaseOverall || 0);
      const numA = Math.min(105, baseA + bonusA);

      let cardB = availableCards.find(c => c.imageUrl === b.cardBgUrl) || availableCards.find(c => c.isDefault);
      if (cardB && cardB.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (cardB.expirationDate < todayStr) {
          cardB = availableCards.find(c => c.name.toUpperCase() === 'GERAL') || availableCards.find(c => c.isDefault);
        }
      }
      const isArtilheiroB = cardB?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const bonusB = isArtilheiroB ? 5 : (cardB?.increaseOverall || 0);
      const numB = Math.min(105, baseB + bonusB);
      
      if (numB !== numA) return numB - numA;
      return (a.nickname || a.name).localeCompare(b.nickname || b.name);
    });

  const getPositionIcon = (pos: Position) => {
    return <span className={`text-[8px] font-black ${getPositionColor(pos)} leading-none`}>{getPositionAbbr(pos)}</span>;
  };

  const OverallModal = ({ currentCardBgUrl }: { currentCardBgUrl: string }) => {
    const currentAdminId = auth.currentUser?.uid || 'unknown';
    const currentRating = overallStats.ratings?.[currentAdminId] || 75;
    const averageRating = calculateAverage(overallStats);
    const avgPoints = editingPlayer ? (editingPlayer.stats.points / (editingPlayer.stats.matches || 1)) : 0;
    
    // Calculate bonus
    let cardUsed = availableCards.find(c => c.imageUrl === currentCardBgUrl) || availableCards.find(c => c.isDefault);
    if (cardUsed && cardUsed.expirationDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (cardUsed.expirationDate < todayStr) {
        cardUsed = availableCards.find(c => c.name.toUpperCase() === 'GERAL') || availableCards.find(c => c.isDefault);
      }
    }
    const isArtilheiro = cardUsed?.name?.toUpperCase()?.includes('ARTILHEIRO');
    const bonus = isArtilheiro ? 5 : (cardUsed?.increaseOverall || 0);
    
    // Calculate grade with bonus
    const baseOverall = calculateGrade(overallStats, avgPoints);
    const finalOverallScore = parseInt(baseOverall.grade, 10) + bonus;

    const grade = Math.min(105, finalOverallScore).toString().padStart(2, '0');
    const color = getGradeColor(parseInt(grade, 10));
    
    const adminCount = Object.keys(overallStats.ratings || {}).length;

    const handleConfirmNota = async () => {
      if (editingPlayer) {
        try {
          setIsSavingRating(true);
          const tempRatings = currentRating !== undefined 
            ? { ...(overallStats.ratings || {}), [currentAdminId]: currentRating }
            : (overallStats.ratings || {});
          const currentAvgPts = (editingPlayer.stats?.points || 0) / (editingPlayer.stats?.matches || 1);
          const { grade: newGrade } = calculateGrade({ ratings: tempRatings }, currentAvgPts);
          let newOverallValue = parseInt(newGrade) || 75;

          const playerAwardsBonus = monthlyAwards.filter(a => a.playerId === editingPlayer.id).length;
          newOverallValue = Math.min(105, newOverallValue + bonus + playerAwardsBonus);

          const updatedOverallStats = {
            ...(editingPlayer.overallStats || {}),
            ratings: tempRatings
          };

          await updateDoc(doc(db, 'players', editingPlayer.id), {
            overallValue: newOverallValue,
            overallStats: updatedOverallStats
          });

          setEditingPlayer(prev => prev ? {
            ...prev,
            overallValue: newOverallValue,
            overallStats: updatedOverallStats
          } : null);
        } catch (err) {
          console.error("Erro ao salvar nota do atleta:", err);
          alert("Erro ao salvar a nota do atleta.");
        } finally {
          setIsSavingRating(false);
        }
      }
      setIsOverallModalOpen(false);
    };

    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOverallModalOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-gray-100"
        >
          <div className="p-8 md:p-10 overflow-y-auto">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Habilidade</h3>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Média de {adminCount} {adminCount === 1 ? 'Admin' : 'Admins'} {bonus > 0 && `(Bonus Card: +${bonus})`}</p>
              </div>
              <div className="flex flex-col items-end">
                <div className={`text-5xl md:text-6xl font-black italic ${color} drop-shadow-sm`}>
                  {grade}
                </div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Nível Global: {averageRating.toFixed(1)}</div>
              </div>
            </div>

            <div className="space-y-10 py-4">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11px] uppercase font-black text-primary-blue tracking-widest italic">
                    <Star className="w-4 h-4 text-primary-yellow fill-current" />
                    Sua Nota
                  </div>
                  <span className={`text-2xl font-black ${getGradeColor(valueToLetter(currentRating !== undefined ? currentRating : 75))} bg-gray-50 px-4 py-1 rounded-xl shadow-sm border border-gray-100`}>
                    {currentRating !== undefined ? currentRating : '--'}
                  </span>
                </div>
                
                <div className="relative pt-2">
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="1"
                    value={currentRating !== undefined ? currentRating : 75}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      const newRatings = { ...(overallStats.ratings || {}), [currentAdminId]: newValue };
                      setOverallStats({ ratings: newRatings });
                    }}
                    className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary-blue"
                  />
                  <div className="flex justify-between mt-4 px-1">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Base (00)</span>
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Elite (100)</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 shadow-inner">
                <div className="mb-6 text-center">
                  <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest italic">Cálculo de Overall</h4>
                  <p className="text-[9px] text-gray-400 mt-1 font-bold">Média das Notas + (Média Pontos × 0.4) + Bonus Card • Limite: 105</p>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { l: '90', r: 'Elite', c: 'text-yellow-500' },
                    { l: '80', r: 'Bom', c: 'text-emerald-500' },
                    { l: '70', r: 'Médio', c: 'text-blue-500' },
                    { l: '60', r: 'Abaixo', c: 'text-orange-500' },
                    { l: '00', r: 'Novo', c: 'text-red-500' }
                  ].map((item) => (
                    <div key={item.l} className="text-center group">
                      <div className={`text-xl font-black ${item.c} group-hover:scale-125 transition-transform`}>{item.l}+</div>
                      <div className="text-[8px] text-gray-400 font-black mt-2 uppercase tracking-tighter">{item.r}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-100 text-[9px] text-gray-400 font-bold leading-normal text-center italic">
                  * Jogadores com cartas especiais terão valores acrescidos ao seu overall enquanto estiverem com a carta.
                </div>
              </div>
            </div>

            <button 
              onClick={handleConfirmNota}
              disabled={isSavingRating}
              className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all mt-10 shadow-xl shadow-blue-100 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <ShieldCheck className="w-5 h-5 text-primary-yellow" />
              <span>{isSavingRating ? 'Salvando...' : 'Confirmar Nota'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const isPageFullyLoaded = !loadingPlayers && !loadingCards && !loadingMatches && !loadingRules;

  if (!isPageFullyLoaded) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
        {/* Animated Soccer Ball inside a FIFA style card silhouette */}
        <div className="relative w-44 h-60 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-[2rem] border-2 border-[#fdcb02]/30 shadow-[0_0_40px_rgba(253,203,2,0.15)] flex flex-col items-center justify-center p-6 overflow-hidden">
          {/* Glowing ambient radial light */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(253,203,2,0.15)_0%,transparent_70%)] animate-pulse" />
          
          {/* Animated decorative lines resembling a FUT card */}
          <div className="absolute inset-2 border border-white/5 rounded-[1.8rem] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#fdcb02]/40 to-transparent" />
          
          <div className="relative flex flex-col items-center gap-4 z-10">
            {/* Pulsing glowing shield spinner */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#fdcb02]/20 blur-xl animate-pulse" />
              <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#fdcb02] animate-spin flex items-center justify-center shadow-lg">
                <Star className="w-6 h-6 text-[#fdcb02] animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-1 text-center">
              <h3 className="text-sm font-black uppercase italic tracking-widest text-white">
                Arena Coxim
              </h3>
              <p className="text-[10px] font-bold text-[#fdcb02]/80 uppercase tracking-[0.2em] animate-pulse">
                Carregando Plantel...
              </p>
            </div>
          </div>
          
          {/* Elegant subtle bottom bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-white/10 rounded-full" />
        </div>
        
        {/* Subtitle / Loader progress hint */}
        <div className="mt-8 max-w-xs space-y-2">
          <div className="h-1.5 w-36 bg-blue-950/20 rounded-full overflow-hidden mx-auto relative">
            <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary-blue to-[#fdcb02] rounded-full animate-pulse w-full" />
          </div>
          <p className="text-[9px] uppercase font-black tracking-wider text-gray-400">
            Sincronizando estatísticas e cards com o servidor...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-8">
          <div>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter text-primary-blue">Plantel</h2>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1 shadow-sm px-2 bg-gray-50 rounded-full inline-block">Gestão de Atletas</p>
          </div>

          {locations && (
            <div className="flex flex-wrap gap-2 mb-2">
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

          <div className="flex items-center gap-3 bg-white p-1 rounded-[1.25rem] border border-gray-100 shadow-sm">
            <div className="bg-primary-blue/5 p-2 rounded-xl ml-1">
              <Sword className="w-4 h-4 text-primary-blue" />
            </div>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="bg-transparent text-primary-blue text-[10px] font-black uppercase tracking-widest py-3 px-4 outline-none border-none focus:ring-0 cursor-pointer"
            >
              <option value="all">Todas as Posições</option>
              <option value="goleiro">GOLEIRO</option>
              <option value="zagueiro">DEFENSOR</option>
              <option value="lateral">LATERAL</option>
              <option value="meio-campo">MEIA</option>
              <option value="centroavante">ATACANTE</option>
            </select>
          </div>
          {isAdmin && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-primary-blue text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 group"
            >
              <UserPlus className="w-5 h-5 text-primary-yellow transition-transform group-hover:rotate-12" /> Novo Atleta
            </button>
          )}
        </div>
      </div>
        
        {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-blue transition-colors w-6 h-6" />
        <input 
          type="text" 
          placeholder="Pesquisar craque pelo nome ou apelido..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border-2 border-gray-100 rounded-3xl py-6 pl-16 pr-8 focus:outline-none focus:border-primary-blue transition-all text-primary-blue font-bold placeholder:text-gray-300 shadow-sm"
        />
      </div>
      
      {/* Players Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {filteredPlayers.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-100 text-center flex flex-col items-center opacity-30">
            <Users className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500 font-black uppercase tracking-[0.2em] italic text-sm">Nenhum atleta encontrado</p>
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const baseGradeObj = player.overallStats && player.overallStats.ratings && Object.keys(player.overallStats.ratings).length > 0
              ? calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1))
              : { grade: '75', color: 'text-blue-400' };
            const baseGradeNum = parseInt(baseGradeObj.grade) || 75;

            // Find current card assigned
            let assignedCard = availableCards.find(c => c.imageUrl === player.cardBgUrl) || availableCards.find(c => c.isDefault);
            if (assignedCard && assignedCard.expirationDate) {
              const todayStr = new Date().toISOString().split('T')[0];
              if (assignedCard.expirationDate < todayStr) {
                assignedCard = availableCards.find(c => c.name.toUpperCase() === 'GERAL') || availableCards.find(c => c.isDefault);
              }
            }
            const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
            const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);

            // Compute overall with card bonus first
            const rawOverallWithBonus = Math.min(105, baseGradeNum + cardBonusValue);

            // Check if overall is less than 90, force "CARTA PRATA" / "PRATA"
            const silverCard = availableCards.find(c => {
              const n = c.name?.toUpperCase() || '';
              return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
            });
            const forceSilverCard = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

            const card = forceSilverCard ? silverCard! : assignedCard;
            const fontColor = card?.fontColor || '#a52a2a';

            // Calculate final overall based on the resolved card
            const finalIsArtilheiro = card?.name?.toUpperCase()?.includes('ARTILHEIRO');
            const finalBonus = finalIsArtilheiro ? 5 : (card?.increaseOverall || 0);
            const finalOverall = Math.min(105, baseGradeNum + finalBonus);

            return (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={player.id} 
              onClick={() => isAdmin ? handleEdit(player) : setSelectedPlayer(player)}
              className="w-full relative select-none cursor-pointer group hover:scale-[1.03] active:scale-95 transition-all filter drop-shadow-md hover:drop-shadow-xl"
            >
              <div
                className="aspect-[3/4] w-full relative"
                style={{
                  backgroundImage: card?.imageUrl ? `url(${card.imageUrl})` : 'none',
                  backgroundColor: !card?.imageUrl ? '#1e293b' : 'transparent',
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center'
                }}
              >
                {isAdmin && (
                  <div className="absolute top-[6%] right-[6%] z-20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all translate-y-0 sm:translate-y-1 sm:group-hover:translate-y-0 flex gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(player.id);
                      }}
                      className="p-2 sm:p-1.5 bg-red-500 hover:bg-red-600 sm:bg-red-500/10 sm:hover:bg-red-500 text-white sm:text-red-600 sm:hover:text-white rounded-xl sm:rounded-lg transition-all shadow-md sm:shadow-sm cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
                    </button>
                  </div>
                )}

                  {/* Rating and Position on the left (Percentage aligned) */}
                <div className="absolute left-[calc(8%+10px)] top-[19%] flex flex-col items-center select-none z-10" style={{ color: fontColor }}>
                  {player.overallStats && player.overallStats.ratings && Object.keys(player.overallStats.ratings).length > 0 ? (
                    <div className="font-black italic text-[1.4rem] xs:text-[1.65rem] sm:text-[2rem] tracking-tighter leading-none">
                      {finalOverall.toString().padStart(2, '0')}
                    </div>
                  ) : (
                    <div className="font-bold text-[8px] sm:text-[10px] uppercase tracking-widest leading-none">
                      N/A
                    </div>
                  )}
                  <div className="mt-0.5 sm:mt-1 bg-amber-950/15 px-1 sm:px-1.5 py-0.5 rounded text-[8px] xs:text-[9.5px] sm:text-[11px] font-black uppercase tracking-wider">
                    {getPositionAbbr(player.position)}
                  </div>
                </div>

                {/* Player Photo (Perfect shield and cutout alignment) */}
                <div className="absolute right-[calc(3%+5px)] top-[18%] w-[71.5%] aspect-square z-10 hover:scale-105 transition-transform duration-300">
                  {player.photoUrl ? (
                    <img 
                      src={player.photoUrl} 
                      alt={player.name} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full rounded-none object-cover shadow-sm bg-transparent"
                    />
                  ) : (
                    <div className="w-full h-full rounded-none bg-amber-950/10 flex items-center justify-center transition-colors shadow-sm">
                      <User className="w-[35%] h-[35%] text-amber-950/30" />
                    </div>
                  )}
                </div>

                {/* Nickname aligned perfectly in its ribbon slot */}
                <div className="absolute left-[10%] top-[72%] w-[80%] h-[10%] z-10 flex items-center justify-center">
                  <h3 className="uppercase italic text-amber-900 font-extrabold w-full text-center leading-none px-1">
                    {(() => {
                      const nameToUse = (player.nickname || player.name || '').trim().toUpperCase();
                      
                      const getDynamicFontSize = (text: string) => {
                        const len = text.length;
                        if (len <= 8) return '15px';
                        if (len <= 10) return '13px';
                        if (len <= 13) return '11.5px';
                        if (len <= 16) return '10px';
                        if (len <= 20) return '8.5px';
                        return '7.5px';
                      };

                      const fontSize = getDynamicFontSize(nameToUse);

                      return (
                        <span 
                          style={{ fontSize, color: fontColor }}
                          className="block font-black tracking-tighter truncate max-w-full"
                        >
                          {nameToUse}
                        </span>
                      );
                    })()}
                  </h3>
                </div>

                {/* Stats aligned perfectly in its bottom slot */}
                <div className="absolute left-0 right-0 bottom-[8%] h-[14%] z-10 flex justify-center items-center gap-[4px] px-1.5" style={{ color: fontColor }}>
                  <div className="flex flex-col items-center justify-center flex-1">
                    <span className="text-[5px] xs:text-[6px] sm:text-[7.5px] font-bold opacity-60 uppercase tracking-tight leading-none animate-none">JOGOS</span>
                    <span className="text-[9.5px] xs:text-[10.5px] sm:text-[12px] font-black mt-1 leading-none">{player.stats.matches}</span>
                  </div>
                  <div 
                    onClick={(e) => {
                      if (adminData?.role === 'master' && isSgtNunes(player)) {
                        startEditingSgtNunes(e, player);
                      }
                    }}
                    className={`flex flex-col items-center justify-center flex-1 transition-all ${
                      adminData?.role === 'master' && isSgtNunes(player) 
                        ? 'cursor-pointer hover:bg-amber-950/15 rounded p-0.5 outline outline-1 outline-dashed outline-amber-950/40' 
                        : ''
                    }`}
                    title={adminData?.role === 'master' && isSgtNunes(player) ? "Clique para editar Gols e Assistências" : undefined}
                  >
                    <span className="text-[5px] xs:text-[6px] sm:text-[7.5px] font-bold opacity-60 uppercase tracking-tight leading-none animate-none flex items-center gap-0.5">
                      GOLS/AST
                      {adminData?.role === 'master' && isSgtNunes(player) && <span className="text-[6px]">✏️</span>}
                    </span>
                    <span className="text-[9.5px] xs:text-[10.5px] sm:text-[12px] font-black mt-1 leading-none whitespace-nowrap">{player.stats.goals} / {player.stats.assists}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center flex-1">
                    <span className="text-[5px] xs:text-[6px] sm:text-[7.5px] font-bold opacity-60 uppercase tracking-tight leading-none animate-none">MÉDIA</span>
                    <div className="flex items-center gap-0.5 text-[9.5px] xs:text-[10.5px] sm:text-[12px] font-black mt-1 leading-none justify-center">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      <span>{((player.stats.points || 0) / (player.stats.matches || 1)).toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                {sgtNunesEditingId === player.id && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 bg-amber-950/95 text-amber-50 z-30 flex flex-col justify-between p-3 rounded-none"
                    style={{ border: '2px solid rgb(217, 119, 6)' }}
                  >
                    <div className="text-center font-black text-[10px] sm:text-[11px] text-amber-400 tracking-wider uppercase border-b border-amber-800/60 pb-1">
                      ESTATÍSTICAS SGT NUNES
                    </div>

                    <div className="flex flex-col gap-2 my-2 flex-grow justify-center">
                      {/* Goals Control */}
                      <div className="flex items-center justify-between px-2 py-1 bg-amber-900/50 rounded-lg">
                        <span className="text-[9px] font-bold uppercase text-amber-200">GOLS</span>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => setSgtNunesGoals(g => Math.max(0, g - 1))}
                            className="w-5 h-5 rounded-full bg-amber-800 hover:bg-amber-700 active:scale-90 flex items-center justify-center font-bold text-[11px]"
                          >
                            -
                          </button>
                          <span className="text-[12px] font-black text-amber-50 min-w-[14px] text-center">
                            {sgtNunesGoals}
                          </span>
                          <button 
                            type="button"
                            onClick={() => setSgtNunesGoals(g => g + 1)}
                            className="w-5 h-5 rounded-full bg-amber-800 hover:bg-amber-700 active:scale-90 flex items-center justify-center font-bold text-[11px]"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Assists Control */}
                      <div className="flex items-center justify-between px-2 py-1 bg-amber-900/50 rounded-lg">
                        <span className="text-[9px] font-bold uppercase text-amber-200">ASSISTÊNCIAS</span>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => setSgtNunesAssists(a => Math.max(0, a - 1))}
                            className="w-5 h-5 rounded-full bg-amber-800 hover:bg-amber-700 active:scale-90 flex items-center justify-center font-bold text-[11px]"
                          >
                            -
                          </button>
                          <span className="text-[12px] font-black text-amber-50 min-w-[14px] text-center">
                            {sgtNunesAssists}
                          </span>
                          <button 
                            type="button"
                            onClick={() => setSgtNunesAssists(a => a + 1)}
                            className="w-5 h-5 rounded-full bg-amber-800 hover:bg-amber-700 active:scale-90 flex items-center justify-center font-bold text-[11px]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSgtNunesEditingId(null)}
                        disabled={isSavingSgtNunes}
                        className="flex-1 py-1 px-2 rounded-lg bg-red-950 border border-red-800 text-[10px] font-bold uppercase text-red-200 active:scale-95"
                      >
                        Sair
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveSgtNunesStats(player)}
                        disabled={isSavingSgtNunes}
                        className="flex-1 py-1 px-2 rounded-lg bg-green-950 border border-green-700 text-[10px] font-bold uppercase text-green-200 active:scale-95 flex items-center justify-center"
                      >
                        {isSavingSgtNunes ? "..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
            );
        })
        )}
      </div>

      {players.length >= playerLimit && (
        <div className="flex justify-center mt-12 mb-8">
          <button 
            onClick={() => setPlayerLimit(prev => prev + 60)}
            className="bg-white border-2 border-primary-blue text-primary-blue px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all shadow-xl shadow-blue-50 active:scale-95"
          >
            Carregar mais atletas
          </button>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="bg-primary-blue p-6 md:p-8 flex items-center justify-between text-white">
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">
                  {editingPlayer ? 'Perfil do Atleta' : 'Novo Atleta'}
                </h3>
                <div className="flex items-center gap-3">
                  {editingPlayer && (
                    <button 
                      type="button"
                      onClick={() => setIsOverallModalOpen(true)}
                      className={`p-2.5 bg-white/10 hover:bg-white/20 ${editingPlayer.overallStats?.ratings?.[auth.currentUser?.uid || ''] ? 'text-green-400' : 'text-primary-yellow'} rounded-xl transition-colors shadow-inner`}
                      title="Definir Atributos"
                    >
                      <Zap className="w-5 h-5 fill-current" />
                    </button>
                  )}
                  <button onClick={resetForm} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto theme-scrollbar">
                {editingPlayer && (
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center shadow-inner">
                      <div className="text-2xl font-black text-primary-blue leading-none italic">{editingPlayer.stats.goals}</div>
                      <div className="text-[9px] uppercase font-black text-gray-400 mt-2 tracking-widest">Gols</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center shadow-inner">
                      <div className="text-2xl font-black text-primary-yellow leading-none italic">{editingPlayer.stats.assists}</div>
                      <div className="text-[9px] uppercase font-black text-gray-400 mt-2 tracking-widest">Assists</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center shadow-inner">
                      <div className="text-2xl font-black text-green-600 leading-none italic">{editingPlayer.stats.wins}</div>
                      <div className="text-[9px] uppercase font-black text-gray-400 mt-2 tracking-widest">Vitórias</div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Local de Atuação</label>
                    <select 
                      required
                      value={locationId}
                      onChange={(e) => {
                        setLocationId(e.target.value);
                        checkDuplicate(name, e.target.value);
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray appearance-none cursor-pointer"
                    >
                      <option value="">Selecione a arena</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Nome Completo</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => {
                        const upperName = e.target.value.toUpperCase();
                        setName(upperName);
                        checkDuplicate(upperName, locationId);
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray placeholder:text-gray-300"
                      placeholder="NOME DO CRAQUE"
                    />
                    {duplicateWarning && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-100 p-4 rounded-2xl mt-2">
                        <p className="text-red-600 text-xs font-black uppercase italic tracking-tight">Já existe um jogador com este nome nesta arena!</p>
                        <div className="flex gap-3 mt-3">
                          <button 
                            type="button"
                            onClick={() => { setName(''); setDuplicateWarning(false); }} 
                            className="bg-white px-4 py-2 rounded-xl text-[9px] font-black uppercase border border-red-100 text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Recomeçar
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDuplicateWarning(false)} 
                            className="bg-red-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-lg shadow-red-100"
                          >
                            Prosseguir
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Apelido</label>
                      <input 
                        required
                        type="text" 
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value.toUpperCase())}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                        placeholder="EX: RONALDINHO"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Posição</label>
                      <select 
                        value={position}
                        onChange={(e) => setPosition(e.target.value as Position)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray cursor-pointer appearance-none"
                      >
                        <option value="goleiro">GOLEIRO</option>
                        <option value="zagueiro">DEFENSOR</option>
                        <option value="lateral">LATERAL</option>
                        <option value="meio-campo">MEIA</option>
                        <option value="centroavante">ATACANTE</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Data de Nascimento</label>
                    <input 
                      type="date" 
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">E-mail (Google Gmail)</label>
                    <input 
                      type="email" 
                      placeholder="jogador@gmail.com"
                      value={gmail}
                      onChange={(e) => setGmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Telefone / WhatsApp</label>
                    <input 
                      type="tel" 
                      placeholder="(67) 99999-9999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                    />
                  </div>

                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-inner">
                    <div>
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest block">Apostas de Longo Prazo</label>
                      <span className="text-[11px] text-gray-500 font-bold block mt-0.5">
                        {!bettingDisabled ? '🟢 APOSTAS ATIVADAS' : '🔴 APOSTAS DESATIVADAS'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBettingDisabled(!bettingDisabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        !bettingDisabled ? 'bg-emerald-500' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          !bettingDisabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Fundo do Card / Tema (Escolha uma opção)</label>
                    <div className="relative">
                      <select 
                        value={cardBgUrl}
                        onChange={(e) => setCardBgUrl(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray cursor-pointer appearance-none"
                      >
                        <option value="">PADRÃO (GERAL)</option>
                        {availableCards.filter(c => c.name.toUpperCase() !== 'GERAL').map(card => (
                          <option key={card.id} value={card.imageUrl}>
                            {card.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Foto de Perfil</label>
                    <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
                      <div 
                        onClick={() => document.getElementById('photo-upload')?.click()}
                        className="w-20 h-20 rounded-3xl border-2 border-dashed border-gray-200 hover:border-primary-blue/50 transition-all cursor-pointer overflow-hidden flex items-center justify-center bg-white shadow-sm"
                      >
                        {photoUrl ? (
                          <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <UserPlus className="w-6 h-6 text-gray-300" />
                            <span className="text-[7px] font-black uppercase text-gray-300">ADD</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => document.getElementById('photo-upload')?.click()}
                            className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary-blue hover:bg-primary-blue hover:text-white transition-all shadow-sm"
                          >
                            Escolher arquivo
                          </button>
                          {photoUrl && (
                            <button 
                              type="button"
                              onClick={() => {
                                setRawImageSrc(photoUrl);
                                setIsCropModalOpen(true);
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-1"
                              title="Ajustar altura / corte"
                            >
                              <Move className="w-3 h-3" />
                              Ajustar Altura
                            </button>
                          )}
                        </div>
                        <input 
                          id="photo-upload"
                          type="file" 
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <input 
                          type="text" 
                          value={photoUrl}
                          onChange={(e) => setPhotoUrl(e.target.value)}
                          className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 focus:outline-none focus:border-primary-blue text-[10px] text-primary-gray font-medium shadow-sm transition-all"
                          placeholder="Ou cole a URL direto aqui..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary-yellow" />
                      {editingPlayer ? 'Salvar Craque' : 'Cadastrar Craque'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOverallModalOpen && <OverallModal currentCardBgUrl={cardBgUrl} />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlayer && (
          <PlayerSummaryModal 
            player={selectedPlayer}
            matches={matches}
            scoringRules={scoringRules}
            availableCards={availableCards}
            isAdminView={isAdmin}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerToDeleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPlayerToDeleteId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col items-center text-center z-[120] border border-gray-100"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter text-primary-blue mb-2">
                Excluir Atleta?
              </h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                Tem certeza que deseja remover este atleta? Esta ação é irreversível e excluirá todo o histórico associado.
              </p>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => setPlayerToDeleteId(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 px-6 rounded-2xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-lg shadow-red-100 cursor-pointer"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImageCropModal 
        isOpen={isCropModalOpen}
        imageSrc={rawImageSrc}
        onClose={() => setIsCropModalOpen(false)}
        onConfirm={(croppedBase64) => {
          // Use base64 directly
          setPhotoUrl(croppedBase64);
          setIsCropModalOpen(false);
        }}
      />
    </div>
  );
}
