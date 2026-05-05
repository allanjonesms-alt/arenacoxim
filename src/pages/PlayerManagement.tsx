import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Player, Position, Location, OverallStats, AdminData } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { Users, UserPlus, Trash2, Edit2, Shield, Sword, ShieldAlert, Search, X, MapPin, Zap, Heart, Dumbbell, Target, Move, Share2, BarChart3, User, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';
import { calculateGrade, calculateAverage, valueToLetter, letterToValue, getGradeColor } from '../utils/gradeUtils';

interface PlayerManagementProps {
  adminData?: AdminData | null;
  adminId?: string;
}

export default function PlayerManagement({ adminData, adminId }: PlayerManagementProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

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
    const unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
      let playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        playersList = playersList.filter(p => p.locationId === adminData.locationId);
      }
      
      setPlayers(playersList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      let locationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      
      // Filter locations if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        locationsList = locationsList.filter(l => l.id === adminData.locationId);
      }
      
      setLocations(locationsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    return () => {
      unsubscribePlayers();
      unsubscribeLocations();
    };
  }, [adminData]);

  useEffect(() => {
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      setLocationId(adminData.locationId);
    }
  }, [adminData, isModalOpen]);

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

    try {
      if (editingPlayer) {
        const updateData: any = {
          name: name.toUpperCase().trim(),
          nickname,
          position,
          locationId,
          photoUrl: photoUrl || '',
        };
        
        // Safely update only the current admin's rating using dot notation
        if (currentRating !== undefined) {
          updateData[`overallStats.ratings.${currentAdminId}`] = currentRating;
        }
        
        await updateDoc(doc(db, 'players', editingPlayer.id), updateData);
      } else {
        const playerData = {
          name: name.toUpperCase().trim(),
          nickname,
          position,
          locationId,
          photoUrl: photoUrl || '',
          stats: { wins: 0, goals: 0, assists: 0, matches: 0 },
          overallStats: {
            ratings: currentRating !== undefined ? { [currentAdminId]: currentRating } : {}
          }
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
      return matchesSearch && matchesLocation;
    })
    .sort((a, b) => {
      const avgA = a.overallStats ? calculateAverage(a.overallStats) : 0;
      const avgB = b.overallStats ? calculateAverage(b.overallStats) : 0;
      if (avgB !== avgA) return avgB - avgA;
      return a.name.localeCompare(b.name);
    });

  const getPositionIcon = (pos: Position) => {
    return <span className={`text-[8px] font-black ${getPositionColor(pos)} leading-none`}>{getPositionAbbr(pos)}</span>;
  };

  const OverallModal = () => {
    const currentAdminId = auth.currentUser?.uid || 'unknown';
    const currentRating = overallStats.ratings?.[currentAdminId] || 75;
    const averageRating = calculateAverage(overallStats);
    const { grade, color } = calculateGrade(overallStats);
    const adminCount = Object.keys(overallStats.ratings || {}).length;

    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOverallModalOpen(false)}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-[#1a1a1a] w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
        >
          <div className="p-4 md:p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tight">Avaliação Técnica</h3>
                <p className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Média de {adminCount} {adminCount === 1 ? 'Admin' : 'Admins'}</p>
              </div>
              <div className="flex flex-col items-end">
                <div className={`text-4xl md:text-5xl font-black italic ${color} drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]`}>
                  {grade}
                </div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Média: {averageRating.toFixed(1)}</div>
              </div>
            </div>

            <div className="space-y-8 py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] md:text-xs uppercase font-black text-gray-300 tracking-widest">
                    <Star className="w-4 h-4 text-[#00ff00]" />
                    Sua Avaliação
                  </div>
                  <span className={`text-xl font-black ${getGradeColor(valueToLetter(currentRating))}`}>
                    {currentRating}
                  </span>
                </div>
                
                <div className="relative pt-2">
                  <input 
                    type="range" 
                    min="50" 
                    max="100" 
                    step="1"
                    value={currentRating}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      const newRatings = { ...(overallStats.ratings || {}), [currentAdminId]: newValue };
                      setOverallStats({ ratings: newRatings });
                    }}
                    className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#00ff00]"
                  />
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[8px] font-black text-gray-600">50 (E)</span>
                    <span className="text-[8px] font-black text-gray-600">75 (C)</span>
                    <span className="text-[8px] font-black text-gray-600">100 (A)</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <h4 className="text-[9px] font-black uppercase text-gray-500 tracking-widest mb-3">Escala de Categorias</h4>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { l: 'A', r: '90-100', c: 'text-yellow-400' },
                    { l: 'B', r: '80-89', c: 'text-emerald-400' },
                    { l: 'C', r: '70-79', c: 'text-blue-400' },
                    { l: 'D', r: '60-69', c: 'text-orange-400' },
                    { l: 'E', r: '50-59', c: 'text-red-400' }
                  ].map((item) => (
                    <div key={item.l} className="text-center">
                      <div className={`text-lg font-black ${item.c}`}>{item.l}</div>
                      <div className="text-[7px] text-gray-600 font-bold">{item.r}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsOverallModalOpen(false)}
              className="w-full bg-[#00ff00] text-black py-3 md:py-4 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors mt-6"
            >
              Confirmar Avaliação
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Jogadores</h2>
            <p className="text-gray-500 text-sm">Cadastre e gerencie os atletas da arena.</p>
          </div>

          {adminData?.role === 'master' && (
            <div className="flex items-center gap-2 bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
              <MapPin className="w-4 h-4 text-[#00ff00] ml-2" />
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-transparent text-white text-xs font-bold uppercase tracking-widest py-2 px-3 outline-none border-none focus:ring-0"
              >
                <option value="all" className="bg-[#1a1a1a] text-white">Todos os Locais</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id} className="bg-[#1a1a1a] text-white">{loc.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#00cc00] transition-all hover:scale-105"
        >
          <UserPlus className="w-5 h-5" /> Novo Jogador
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar jogador pelo nome..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[#00ff00] transition-colors text-white"
        />
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredPlayers.map((player) => (
          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={player.id} 
            onClick={() => handleEdit(player)}
            className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden group hover:border-[#00ff00]/30 transition-all cursor-pointer relative"
          >
            <div className="absolute top-0 left-0 z-10">
              {player.overallStats && player.overallStats.ratings && Object.keys(player.overallStats.ratings).length > 0 ? (
                <div className={`bg-[#222] px-3 py-1.5 rounded-br-2xl border-r border-b border-white/10 font-black italic text-xl ${calculateGrade(player.overallStats).color} shadow-lg shadow-black/50`}>
                  {calculateGrade(player.overallStats).grade}
                </div>
              ) : (
                <div className="bg-[#222] px-3 py-1.5 rounded-br-2xl border-r border-b border-white/10 font-black italic text-xs text-gray-500 shadow-lg shadow-black/50">
                  N/A
                </div>
              )}
              {adminId && (!player.overallStats?.ratings?.[adminId]) && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(player);
                  }}
                  className="mt-2 ml-2 bg-[#00ff00] text-black px-2 py-1 rounded-lg text-[10px] font-black uppercase italic hover:bg-[#00cc00] transition-colors"
                >
                  Avaliar
                </button>
              )}
            </div>
            <div className="absolute top-2 right-2 z-10">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(player.id);
                }}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="flex justify-center mb-2 relative">
                {player.photoUrl ? (
                  <img 
                    src={player.photoUrl} 
                    alt={player.name} 
                    className="w-16 h-16 rounded-full border-2 border-white/10 group-hover:border-[#00ff00] transition-colors object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full border-2 border-white/10 bg-white/5 flex items-center justify-center group-hover:border-[#00ff00] transition-colors">
                    <User size={32} className="text-gray-600" />
                  </div>
                )}
                <div className="absolute -bottom-1 right-1/2 translate-x-8 bg-[#222] px-1.5 py-0.5 rounded-full border border-white/10 flex items-center justify-center min-w-[20px]">
                  {getPositionIcon(player.position)}
                </div>
              </div>
                <div className="text-center mb-2">
                  <h3 className="text-sm font-bold truncate leading-tight">{player.nickname || player.name}</h3>
                  <div className="flex items-center justify-center gap-1 mt-0.5 text-[8px] text-gray-500 font-bold uppercase">
                    <MapPin className="w-2 h-2 text-[#00ff00]" />
                    {getLocationName(player.locationId)}
                  </div>
                </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#1a1a1a] w-full max-w-md rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="p-5 md:p-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-4 md:mb-8">
                  <h3 className="text-lg md:text-2xl font-black uppercase italic tracking-tight">
                    {editingPlayer ? 'PERFIL DO JOGADOR' : 'Novo Jogador'}
                  </h3>
                  <div className="flex items-center gap-2">
                    {editingPlayer && (
                      <button 
                        type="button"
                        onClick={() => setIsOverallModalOpen(true)}
                        className="p-2 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 text-[#00ff00] rounded-full transition-colors"
                        title="Definir Atributos"
                      >
                        <Zap className="w-5 h-5" />
                      </button>
                    )}
                    <button onClick={resetForm} className="p-2 hover:bg-white/5 rounded-full"><X /></button>
                  </div>
                </div>

                {editingPlayer && (
                  <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-6">
                    <div className="bg-black/40 p-2 md:p-3 rounded-xl border border-white/5 text-center">
                      <div className="text-lg md:text-xl font-black text-[#00ff00] leading-none">{editingPlayer.stats.goals}</div>
                      <div className="text-[8px] md:text-[9px] uppercase font-black text-gray-500 mt-1">Gols</div>
                    </div>
                    <div className="bg-black/40 p-2 md:p-3 rounded-xl border border-white/5 text-center">
                      <div className="text-lg md:text-xl font-black text-[#00ff00] leading-none">{editingPlayer.stats.assists}</div>
                      <div className="text-[8px] md:text-[9px] uppercase font-black text-gray-500 mt-1">Assists</div>
                    </div>
                    <div className="bg-black/40 p-2 md:p-3 rounded-xl border border-white/5 text-center">
                      <div className="text-lg md:text-xl font-black text-[#00ff00] leading-none">{editingPlayer.stats.wins}</div>
                      <div className="text-[8px] md:text-[9px] uppercase font-black text-gray-500 mt-1">Vitórias</div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3 md:space-y-6">
                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-1">
                      Local de Partida <span className="text-red-500">*</span>
                    </label>
                    <select 
                      required
                      value={locationId}
                      onChange={(e) => {
                        setLocationId(e.target.value);
                        checkDuplicate(name, e.target.value);
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm text-white"
                    >
                      <option value="" className="bg-[#1a1a1a] text-white">Selecione um local</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id} className="bg-[#1a1a1a] text-white">{loc.name}</option>
                      ))}
                    </select>
                    {locations.length === 0 && (
                      <p className="text-[9px] text-red-500 font-bold">Nenhum local cadastrado.</p>
                    )}
                  </div>

                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-1">
                      Nome Completo <span className="text-red-500">*</span>
                    </label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => {
                        const upperName = e.target.value.toUpperCase();
                        setName(upperName);
                        checkDuplicate(upperName, locationId);
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm text-white"
                      placeholder="Ex: Ronaldinho Gaúcho"
                    />
                    {duplicateWarning && (
                      <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mt-2">
                        <p className="text-red-500 text-xs font-bold">Atenção: Já existe um jogador com este nome neste local!</p>
                        <div className="flex gap-2 mt-3">
                          <button 
                            type="button"
                            onClick={() => { setName(''); setDuplicateWarning(false); }} 
                            className="bg-white/5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-white/10"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDuplicateWarning(false)} 
                            className="bg-red-500/20 text-red-500 px-4 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-red-500/30"
                          >
                            Continuar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div className="space-y-1 md:space-y-2">
                      <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-1">
                        Apelido <span className="text-red-500">*</span>
                      </label>
                      <input 
                        required
                        type="text" 
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm text-white"
                        placeholder="Ex: Bruxo"
                      />
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest">Posição</label>
                      <select 
                        value={position}
                        onChange={(e) => setPosition(e.target.value as Position)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm text-white"
                      >
                      <option value="goleiro" className="bg-[#1a1a1a] text-white">GK</option>
                      <option value="zagueiro" className="bg-[#1a1a1a] text-white">DF</option>
                      <option value="lateral" className="bg-[#1a1a1a] text-white">LAT</option>
                      <option value="meio-campo" className="bg-[#1a1a1a] text-white">MAT</option>
                      <option value="centroavante" className="bg-[#1a1a1a] text-white">CA</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest">Foto do Jogador</label>
                    <div className="flex items-center gap-4">
                      <div 
                        onClick={() => document.getElementById('photo-upload')?.click()}
                        className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 hover:border-[#00ff00]/50 transition-colors cursor-pointer overflow-hidden flex items-center justify-center bg-black/20"
                      >
                        {photoUrl ? (
                          <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <UserPlus className="w-8 h-8 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <button 
                          type="button"
                          onClick={() => document.getElementById('photo-upload')?.click()}
                          className="text-[10px] font-black uppercase tracking-widest text-[#00ff00] hover:underline"
                        >
                          Upload de Foto
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
                          className="w-full bg-black/40 border border-white/10 rounded-xl py-2 md:py-2.5 px-4 focus:outline-none focus:border-[#00ff00] text-xs text-white"
                          placeholder="Ou cole a URL da imagem..."
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-[#00ff00] text-black py-3 md:py-4 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors mt-2 md:mt-4 text-xs md:text-sm"
                  >
                    {editingPlayer ? 'Salvar Alterações' : 'Cadastrar Jogador'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOverallModalOpen && <OverallModal />}
      </AnimatePresence>
    </div>
  );
}
