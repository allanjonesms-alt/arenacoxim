import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Player, Position, Location, OverallStats, AdminData, Match, ScoringRules } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { Users, UserPlus, Trash2, Edit2, Shield, Sword, ShieldAlert, Search, X, MapPin, Zap, Heart, Dumbbell, Target, Move, Share2, BarChart3, User, Star, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';
import { calculateGrade, calculateAverage, valueToLetter, letterToValue, getGradeColor } from '../utils/gradeUtils';
import { Link } from 'react-router-dom';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlayerSummaryModal } from '../components/PlayerSummaryModal';
import cardBg from '../assets/images/athlete_card_bg_1779303562880.png';

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

  const isAdmin = adminData !== null;

  // Form State
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState<Position>('centroavante');
  const [locationId, setLocationId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isOverallModalOpen, setIsOverallModalOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
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
      setPlayers(playersList);
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
      } else {
         handleFirestoreError(err, OperationType.LIST, 'players');
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
    }, (err) => {
      console.error("Erro ao carregar regras de pontuação:", err);
    });

    // Listen to matches
    const qMatches = query(collection(db, 'matches'), orderBy('createdAt', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(list);
    }, (err) => {
      console.error("Erro ao carregar partidas:", err);
    });

    return () => {
      unsubscribeScoring();
      unsubscribeMatches();
    };
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    const currentAdminId = auth.currentUser?.uid || 'unknown';
    const currentRating = overallStats.ratings?.[currentAdminId];

    // Calculate overall for sorting
    const tempRatings = currentRating !== undefined 
      ? { ...(overallStats.ratings || {}), [currentAdminId]: currentRating }
      : (overallStats.ratings || {});
    const avgPoints = editingPlayer ? ((editingPlayer.stats.points || 0) / (editingPlayer.stats.matches || 1)) : 0;
    const { grade } = calculateGrade({ ratings: tempRatings }, avgPoints);
    const overallValue = parseInt(grade) || 75;

    try {
      if (editingPlayer) {
        const updateData: any = {
          name: name.toUpperCase().trim(),
          nickname: nickname.toUpperCase().trim(),
          position,
          locationId,
          photoUrl: photoUrl || '',
          overallValue: overallValue
        };
        
        // Safely update only the current admin's rating using dot notation
        if (currentRating !== undefined) {
          updateData[`overallStats.ratings.${currentAdminId}`] = currentRating;
        }
        
        await updateDoc(doc(db, 'players', editingPlayer.id), updateData);
      } else {
        const playerData = {
          name: name.toUpperCase().trim(),
          nickname: nickname.toUpperCase().trim(),
          position,
          locationId,
          photoUrl: photoUrl || '',
          stats: { wins: 0, goals: 0, assists: 0, matches: 0, points: 0 },
          overallStats: {
            ratings: currentRating !== undefined ? { [currentAdminId]: currentRating } : {}
          },
          overallValue: overallValue
        };
        await addDoc(collection(db, 'players'), playerData);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingPlayer ? OperationType.UPDATE : OperationType.CREATE, 'players');
    }
  };

  const resetForm = () => {
    setName('');
    setNickname('');
    setPosition('centroavante');
    setLocationId(adminData && adminData.role !== 'master' && adminData.locationId ? adminData.locationId : '');
    setPhotoUrl('');
    setEditingPlayer(null);
    setIsModalOpen(false);
    setIsOverallModalOpen(false);
    setOverallStats({
      ratings: {}
    });
  };

  const handleEdit = (player: Player) => {
    setEditingPlayer(player);
    setName(player.name);
    setNickname(player.nickname);
    setPosition(player.position);
    
    // Resolve locationId: if it's a name (legacy), find the ID so the dropdown selects it
    let resolvedLocId = player.locationId || '';
    const locByName = locations.find(l => 
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

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este jogador?')) {
      try {
        await deleteDoc(doc(db, 'players', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'players');
      }
    }
  };

  const getLocationName = (locId: string) => {
    if (!locId) return 'Local';
    const loc = locations.find(l => l.id === locId);
    if (loc) return loc.name;
    
    // Fallback: check if the locId matches a location name (for legacy data)
    const normalizedLocId = (locId || '').trim().toLowerCase();
    const locByName = locations.find(l => (l.name || '').trim().toLowerCase() === normalizedLocId);
    if (locByName) return locByName.name;
    
    return 'Local';
  };

  const filteredPlayers = players
    .filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLocation = selectedLocationId === 'all' || p.locationId === selectedLocationId;
      const matchesPosition = selectedPosition === 'all' || p.position === selectedPosition;
      const hasMatches = p.stats?.matches !== 0;
      return matchesSearch && matchesLocation && matchesPosition && hasMatches;
    })
    .sort((a, b) => {
      const avgA = (a.stats.points || 0) / (a.stats.matches || 1);
      const avgB = (b.stats.points || 0) / (b.stats.matches || 1);
      const numA = parseInt(calculateGrade(a.overallStats, avgA).grade) || 0;
      const numB = parseInt(calculateGrade(b.overallStats, avgB).grade) || 0;
      
      if (numB !== numA) return numB - numA;
      return (a.nickname || a.name).localeCompare(b.nickname || b.name);
    });

  const getPositionIcon = (pos: Position) => {
    return <span className={`text-[8px] font-black ${getPositionColor(pos)} leading-none`}>{getPositionAbbr(pos)}</span>;
  };

  const OverallModal = () => {
    const currentAdminId = auth.currentUser?.uid || 'unknown';
    const currentRating = overallStats.ratings?.[currentAdminId] || 75;
    const averageRating = calculateAverage(overallStats);
    const avgPoints = editingPlayer ? (editingPlayer.stats.points / (editingPlayer.stats.matches || 1)) : 0;
    const { grade, color } = calculateGrade(overallStats, avgPoints);
    const adminCount = Object.keys(overallStats.ratings || {}).length;

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
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Média de {adminCount} {adminCount === 1 ? 'Admin' : 'Admins'}</p>
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
                  <span className={`text-2xl font-black ${getGradeColor(valueToLetter(currentRating))} bg-gray-50 px-4 py-1 rounded-xl shadow-sm border border-gray-100`}>
                    {currentRating}
                  </span>
                </div>
                
                <div className="relative pt-2">
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="1"
                    value={currentRating}
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
                  <p className="text-[9px] text-gray-400 mt-1 font-bold">Média das Notas + (Média Pontos × 0.3) • Limite: 105</p>
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
              </div>
            </div>

            <button 
              onClick={() => setIsOverallModalOpen(false)}
              className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all mt-10 shadow-xl shadow-blue-100 active:scale-95 flex items-center justify-center gap-3"
            >
              <ShieldCheck className="w-5 h-5 text-primary-yellow" />
              <span>Confirmar Nota</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

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
          filteredPlayers.map((player) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={player.id} 
              onClick={() => isAdmin ? handleEdit(player) : setSelectedPlayer(player)}
              className="w-full relative select-none cursor-pointer group hover:scale-[1.03] active:scale-95 transition-all filter drop-shadow-md hover:drop-shadow-xl"
            >
              <div
                className={`aspect-[3/4] w-full flex flex-col justify-between p-4 pb-5 relative bg-amber-900/0`}
                style={{
                  backgroundImage: `url(${cardBg})`,
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center'
                }}
              >
                {isAdmin && (
                  <div className="absolute top-8 right-6 z-20 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(player.id);
                      }}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white rounded-lg transition-all shadow-sm"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Upper Section (60%) */}
                <div className="flex justify-between items-start w-full h-[58%] relative">
                  {/* Left Side: Rating and Position */}
                  <div className="flex flex-col items-center mt-12 pl-3 select-none">
                    {player.overallStats && player.overallStats.ratings && Object.keys(player.overallStats.ratings).length > 0 ? (
                      <div className={`font-black italic text-[1.75rem] sm:text-4xl text-amber-950 tracking-tighter leading-none`}>
                        {calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).grade}
                      </div>
                    ) : (
                      <div className="font-bold text-[10px] text-amber-900/60 uppercase tracking-widest leading-none">
                        N/A
                      </div>
                    )}
                    <div className="mt-1 bg-amber-950/15 px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-amber-950 tracking-wider">
                      {getPositionAbbr(player.position)}
                    </div>
                  </div>

                  {/* Right / Center: Profile photo */}
                  <div className="flex-1 flex justify-center items-start pt-[2.25rem] h-full pr-1">
                    <div className="p-0.5 rounded-full border border-dashed border-amber-500/30 group-hover:border-amber-600 transition-colors shadow-inner bg-amber-950/5">
                      {player.photoUrl ? (
                        <img 
                          src={player.photoUrl} 
                          alt={player.name} 
                          referrerPolicy="no-referrer"
                          className="w-[5.8rem] h-[5.8rem] sm:w-[6.8rem] sm:h-[6.8rem] rounded-full object-cover shadow-sm group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-[5.8rem] h-[5.8rem] sm:w-[6.8rem] sm:h-[6.8rem] rounded-full bg-amber-950/10 flex items-center justify-center group-hover:bg-amber-950/15 transition-colors">
                          <User size={36} className="text-amber-950/30" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle Section: Nickname */}
                <div className="w-full text-center mt-1">
                  <h3 className="text-[10px] sm:text-[11px] font-black uppercase italic tracking-wider text-amber-950 leading-none py-1 border-t border-b border-amber-950/15 truncate w-full group-hover:text-amber-900 transition-colors">
                    {(player.nickname || '').toUpperCase() || player.name}
                  </h3>
                </div>
                
                {/* Bottom Section: Key stats */}
                <div className="w-full flex justify-between items-center bg-amber-950/5 px-2 py-1.5 rounded-xl border border-amber-500/10">
                  <div className="flex flex-col items-center">
                    <span className="text-[7px] font-black text-amber-900/60 uppercase tracking-wider">Jogos</span>
                    <span className="text-[10px] font-black text-amber-950">{player.stats.matches}</span>
                  </div>
                  <div className="flex flex-col items-center border-x border-amber-950/10 px-1 flex-grow">
                    <span className="text-[7px] font-black text-amber-900/60 uppercase tracking-wider">Gols / Ast</span>
                    <span className="text-[10px] font-black text-amber-950">{player.stats.goals} / {player.stats.assists}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[7px] font-black text-amber-900/60 uppercase tracking-wider">Média</span>
                    <div className="flex items-center gap-0.5 text-[10px] font-black text-amber-950">
                      <Star className="w-2.5 h-2.5 fill-amber-700 text-amber-700" />
                      <span>{((player.stats.points || 0) / (player.stats.matches || 1)).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
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
                        <button 
                          type="button"
                          onClick={() => document.getElementById('photo-upload')?.click()}
                          className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary-blue hover:bg-primary-blue hover:text-white transition-all shadow-sm"
                        >
                          Escolher arquivo
                        </button>
                        <input 
                          id="photo-upload"
                          type="file" 
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <input 
                          type="url" 
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
        {isOverallModalOpen && <OverallModal />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlayer && (
          <PlayerSummaryModal 
            player={selectedPlayer}
            matches={matches}
            scoringRules={scoringRules}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
