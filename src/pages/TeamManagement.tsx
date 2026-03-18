import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Team, Location, AdminData } from '../types';
import { Shield, Plus, Trash2, Edit2, MapPin, X, Search, Palette, Map, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { handleFirestoreError, OperationType } from '../App';
import { Link } from 'react-router-dom';

const JERSEY_COLORS = [
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Amarelo', hex: '#eab308' },
  { name: 'Branco', hex: '#ffffff' },
  { name: 'Preto', hex: '#111111' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Roxo', hex: '#a855f7' },
];

interface TeamManagementProps {
  adminData?: AdminData | null;
}

export default function TeamManagement({ adminData }: TeamManagementProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [color, setColor] = useState(JERSEY_COLORS[0].hex);
  const [playerCount, setPlayerCount] = useState<number>(5);

  useEffect(() => {
    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      let teamsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        teamsList = teamsList.filter(t => t.locationId === adminData.locationId);
      }
      
      setTeams(teamsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'teams'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      let locationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      
      // Filter locations if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        locationsList = locationsList.filter(l => l.id === adminData.locationId);
      }
      
      setLocations(locationsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    return () => {
      unsubscribeTeams();
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
    const teamData = {
      name,
      locationId,
      color,
      playerCount
    };

    try {
      if (editingTeam) {
        await updateDoc(doc(db, 'teams', editingTeam.id), teamData);
      } else {
        await addDoc(collection(db, 'teams'), teamData);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingTeam ? OperationType.UPDATE : OperationType.CREATE, 'teams');
    }
  };

  const resetForm = () => {
    setName('');
    setLocationId(adminData && adminData.role !== 'master' && adminData.locationId ? adminData.locationId : '');
    setColor(JERSEY_COLORS[0].hex);
    setPlayerCount(5);
    setEditingTeam(null);
    setIsModalOpen(false);
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    setName(team.name);
    
    // Resolve locationId: if it's a name (legacy), find the ID so the dropdown selects it
    let resolvedLocId = team.locationId || '';
    const locByName = locations.find(l => 
      l.name?.trim().toLowerCase() === (team.locationId || '').trim().toLowerCase()
    );
    // Only use the name-match ID if the current locationId doesn't match any existing ID
    if (locByName && !locations.some(l => l.id === team.locationId)) {
      resolvedLocId = locByName.id;
    }
    
    setLocationId(resolvedLocId);
    setColor(team.color || JERSEY_COLORS[0].hex);
    setPlayerCount(team.playerCount || 5);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este time?')) {
      try {
        await deleteDoc(doc(db, 'teams', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'teams');
      }
    }
  };

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

  const filteredTeams = teams.filter(t => {
    const locName = getLocationName(t.locationId);
    return t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           locName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Times</h2>
          <p className="text-gray-500 text-sm">Cadastre os times, locais e uniformes.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#00cc00] transition-all hover:scale-105"
        >
          <Plus className="w-5 h-5" /> Novo Time
        </button>
      </div>

      {/* Bulk Actions */}
      {teams.some(t => t.name.toUpperCase() === 'GENERICO') && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-tight">Existem times genéricos detectados</span>
          </div>
          <button 
            onClick={async () => {
              if (window.confirm('Deseja excluir TODOS os times com o nome "GENERICO"?')) {
                const genericTeams = teams.filter(t => t.name.toUpperCase() === 'GENERICO');
                for (const team of genericTeams) {
                  try {
                    await deleteDoc(doc(db, 'teams', team.id));
                  } catch (error) {
                    console.error(`Erro ao excluir time ${team.id}:`, error);
                  }
                }
              }
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
          >
            Excluir todos "GENERICO"
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar time ou local..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[#00ff00] transition-colors"
        />
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeams.map((team) => (
          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={team.id} 
            className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden group hover:border-[#00ff00]/30 transition-all"
          >
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative group-hover:scale-110 transition-transform duration-300">
                  <SoccerJersey color={team.color} size={60} />
                </div>
                  <div>
                    <h3 className="text-xl font-bold truncate">{team.name}</h3>
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <MapPin className="w-3 h-3 text-[#00ff00]" /> 
                      {getLocationName(team.locationId)}
                    </div>
                  </div>
              </div>

              <div className="flex items-center gap-2 mt-6">
                <button 
                  onClick={() => handleEdit(team)}
                  className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-3 h-3" /> Editar
                </button>
                <button 
                  onClick={() => handleDelete(team.id)}
                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
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
              className="relative bg-[#1a1a1a] w-full max-w-md rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-4 md:mb-5">
                  <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">
                    {editingTeam ? 'Editar Time' : 'Novo Time'}
                  </h3>
                  <button onClick={resetForm} className="p-2 hover:bg-white/5 rounded-full"><X /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
                  <div className="flex justify-center py-2">
                    <SoccerJersey color={color} size={80} className="animate-pulse" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Nome do Time</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 focus:outline-none focus:border-[#00ff00]"
                      placeholder="Ex: Real Madruga"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center justify-between">
                      Local de Jogo
                      <Link to="/admin/locations" className="text-[#00ff00] hover:underline normal-case font-bold flex items-center gap-1">
                        <Plus className="w-2 h-2" /> Novo
                      </Link>
                    </label>
                    <select 
                      required
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 focus:outline-none focus:border-[#00ff00] appearance-none"
                    >
                      <option value="" disabled>Selecione um local</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                    {locations.length === 0 && (
                      <p className="text-[10px] text-red-400 italic">Nenhum local cadastrado.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Jogadores por Partida</label>
                    <input 
                      required
                      type="number" 
                      min="1"
                      max="20"
                      value={playerCount}
                      onChange={(e) => setPlayerCount(Number(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 focus:outline-none focus:border-[#00ff00]"
                      placeholder="Ex: 5"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                      <Palette className="w-3 h-3" /> Cor do Uniforme
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {JERSEY_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setColor(c.hex)}
                          className={`h-8 rounded-lg border-2 transition-all ${color === c.hex ? 'border-[#00ff00] scale-110 shadow-[0_0_10px_rgba(0,255,0,0.3)]' : 'border-transparent hover:scale-105'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-[#00ff00] text-black py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors mt-2"
                  >
                    {editingTeam ? 'Salvar Alterações' : 'Cadastrar Time'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
