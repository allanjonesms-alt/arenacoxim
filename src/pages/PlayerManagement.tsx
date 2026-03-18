import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Player, Position, Location, OverallStats, AdminData } from '../types';
import { Users, UserPlus, Trash2, Edit2, Shield, Sword, ShieldAlert, Search, X, MapPin, Zap, Heart, Dumbbell, Target, Move, Share2, BarChart3, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';
import { calculateGrade, calculateAverage, valueToLetter, letterToValue, getGradeColor } from '../utils/gradeUtils';

interface PlayerManagementProps {
  adminData?: AdminData | null;
}

export default function PlayerManagement({ adminData }: PlayerManagementProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState<Position>('atacante');
  const [locationId, setLocationId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isOverallModalOpen, setIsOverallModalOpen] = useState(false);
  const [overallStats, setOverallStats] = useState<OverallStats>({
    speed: 75,
    stamina: 75,
    strength: 75,
    shooting: 75,
    dribbling: 75,
    passing: 75
  });

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

    const playerData = {
      name,
      nickname,
      position,
      locationId,
      photoUrl: photoUrl || '',
      stats: editingPlayer?.stats || { wins: 0, goals: 0, assists: 0, matches: 0 },
      overallStats
    };

    try {
      if (editingPlayer) {
        await updateDoc(doc(db, 'players', editingPlayer.id), playerData);
      } else {
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
    setPosition('atacante');
    setLocationId(adminData && adminData.role !== 'master' && adminData.locationId ? adminData.locationId : '');
    setPhotoUrl('');
    setEditingPlayer(null);
    setIsModalOpen(false);
    setIsOverallModalOpen(false);
    setOverallStats({
      speed: 75,
      stamina: 75,
      strength: 75,
      shooting: 75,
      dribbling: 75,
      passing: 75
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
        speed: 75,
        stamina: 75,
        strength: 75,
        shooting: 75,
        dribbling: 75,
        passing: 75
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
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const avgA = a.overallStats ? calculateAverage(a.overallStats) : 0;
      const avgB = b.overallStats ? calculateAverage(b.overallStats) : 0;
      if (avgB !== avgA) return avgB - avgA;
      return a.name.localeCompare(b.name);
    });

  const getPositionIcon = (pos: Position) => {
    switch (pos) {
      case 'goleiro': return <ShieldAlert className="w-4 h-4 text-yellow-500" />;
      case 'defensor': return <Shield className="w-4 h-4 text-blue-500" />;
      case 'atacante': return <Sword className="w-4 h-4 text-red-500" />;
    }
  };

  const OverallModal = () => {
    const { grade, color } = calculateGrade(overallStats);
    
    const statsList = [
      { key: 'speed', label: 'Velocidade', icon: <Zap className="w-4 h-4" /> },
      { key: 'stamina', label: 'Vitalidade', icon: <Heart className="w-4 h-4" /> },
      { key: 'strength', label: 'Força', icon: <Dumbbell className="w-4 h-4" /> },
      { key: 'shooting', label: 'Chute', icon: <Target className="w-4 h-4" /> },
      { key: 'dribbling', label: 'Drible', icon: <Move className="w-4 h-4" /> },
      { key: 'passing', label: 'Passe', icon: <Share2 className="w-4 h-4" /> },
    ];

    const letterToSlider = (letter: string) => {
      switch(letter) {
        case 'A': return 5;
        case 'B': return 4;
        case 'C': return 3;
        case 'D': return 2;
        case 'E': return 1;
        default: return 3;
      }
    };

    const sliderToLetter = (val: number) => {
      switch(val) {
        case 5: return 'A';
        case 4: return 'B';
        case 3: return 'C';
        case 2: return 'D';
        case 1: return 'E';
        default: return 'C';
      }
    };

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
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div>
                <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tight">Atributos</h3>
                <p className="text-gray-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Nível do Atleta</p>
              </div>
              <div className={`text-3xl md:text-4xl font-black italic ${color} drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                {grade}
              </div>
            </div>

            <div className="space-y-2 md:space-y-3">
              {statsList.map((stat) => {
                const currentValue = overallStats[stat.key as keyof OverallStats];
                const currentLetter = valueToLetter(currentValue);
                const sliderValue = letterToSlider(currentLetter);

                return (
                  <div key={stat.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[8px] md:text-[9px] uppercase font-black text-gray-400 tracking-widest">
                        {stat.icon}
                        {stat.label}
                      </div>
                      <span className={`text-[10px] md:text-xs font-black ${getGradeColor(currentLetter)}`}>
                        {currentLetter}
                      </span>
                    </div>
                    <div className="relative pt-1">
                      <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="1"
                        value={sliderValue}
                        onChange={(e) => {
                          const newLetter = sliderToLetter(parseInt(e.target.value));
                          const newValue = letterToValue(newLetter);
                          setOverallStats({ ...overallStats, [stat.key]: newValue });
                        }}
                        className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-[#00ff00]"
                      />
                      <div className="flex justify-between mt-0.5 px-1">
                        {['E', 'D', 'C', 'B', 'A'].map((l) => (
                          <span key={l} className="text-[7px] font-black text-gray-600">{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setIsOverallModalOpen(false)}
              className="w-full bg-[#00ff00] text-black py-2.5 md:py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors mt-4 md:mt-6"
            >
              Confirmar Atributos
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Jogadores</h2>
          <p className="text-gray-500 text-sm">Cadastre e gerencie os atletas da arena.</p>
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
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[#00ff00] transition-colors"
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
            className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden group hover:border-[#00ff00]/30 transition-all"
          >
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
                <div className="absolute -bottom-1 right-1/2 translate-x-8 bg-[#222] p-1 rounded-full border border-white/10">
                  {getPositionIcon(player.position)}
                </div>
                {player.overallStats && (
                  <div className={`absolute top-0 right-0 bg-[#222] px-2 py-0.5 rounded-bl-xl border-l border-b border-white/10 font-black italic text-base ${calculateGrade(player.overallStats).color}`}>
                    {calculateGrade(player.overallStats).grade}
                  </div>
                )}
              </div>
                <div className="text-center mb-2">
                  <h3 className="text-sm font-bold truncate leading-tight">{player.nickname || player.name}</h3>
                  <p className="text-[8px] uppercase font-black text-gray-500 tracking-widest mt-0.5">{player.position}</p>
                  <div className="flex items-center justify-center gap-1 mt-0.5 text-[8px] text-gray-500 font-bold uppercase">
                    <MapPin className="w-2 h-2 text-[#00ff00]" />
                    {getLocationName(player.locationId)}
                  </div>
                </div>

              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => handleEdit(player)}
                  className="flex-1 bg-white/5 hover:bg-white/10 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-2.5 h-2.5 text-[#00ff00]" /> PERFIL
                </button>
                <button 
                  onClick={() => handleDelete(player.id)}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
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
                  <button onClick={resetForm} className="p-2 hover:bg-white/5 rounded-full"><X /></button>
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
                      Nome Completo <span className="text-red-500">*</span>
                    </label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm"
                      placeholder="Ex: Ronaldinho Gaúcho"
                    />
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
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm"
                        placeholder="Ex: Bruxo"
                      />
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest">Posição</label>
                      <select 
                        value={position}
                        onChange={(e) => setPosition(e.target.value as Position)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm"
                      >
                        <option value="atacante">Atacante</option>
                        <option value="defensor">Defensor</option>
                        <option value="goleiro">Goleiro</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-1">
                      Local de Partida <span className="text-red-500">*</span>
                    </label>
                    <select 
                      required
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm"
                    >
                      <option value="">Selecione um local</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                    {locations.length === 0 && (
                      <p className="text-[9px] text-red-500 font-bold">Nenhum local cadastrado.</p>
                    )}
                  </div>

                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[9px] md:text-[10px] uppercase font-black text-gray-500 tracking-widest">URL da Foto (Opcional)</label>
                    <input 
                      type="url" 
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 focus:outline-none focus:border-[#00ff00] text-sm"
                      placeholder="https://..."
                    />
                  </div>

                  {editingPlayer && (
                    <button 
                      type="button"
                      onClick={() => setIsOverallModalOpen(true)}
                      className="w-full bg-white/5 border border-white/10 text-white py-3 md:py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-xs md:text-sm"
                    >
                      <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-[#00ff00]" /> Definir Atributos (Overall)
                    </button>
                  )}

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
