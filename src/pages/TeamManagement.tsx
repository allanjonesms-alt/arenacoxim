import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Team, Location, AdminData } from '../types';
import { Shield, Plus, Trash2, Edit2, MapPin, X, Search, Palette, Map, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

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
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         locName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = selectedLocationId === 'all' || t.locationId === selectedLocationId;
    return matchesSearch && matchesLocation;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-8">
          <div>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter text-primary-blue">Equipes</h2>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1 shadow-sm px-2 bg-gray-50 rounded-full inline-block">Gestão de Times e Cores</p>
          </div>

          {adminData?.role === 'master' && (
            <div className="flex items-center gap-3 bg-white p-1 rounded-[1.25rem] border border-gray-100 shadow-sm">
              <div className="bg-primary-blue/5 p-2 rounded-xl ml-1">
                <MapPin className="w-4 h-4 text-primary-blue" />
              </div>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-transparent text-primary-blue text-[10px] font-black uppercase tracking-widest py-3 px-4 outline-none border-none focus:ring-0 cursor-pointer"
              >
                <option value="all">Todas as Arenas</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-blue text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 group"
        >
          <Plus className="w-5 h-5 text-primary-yellow transition-transform group-hover:rotate-12" /> Novo Time
        </button>
      </div>

      {/* Bulk Actions */}
      {teams.some(t => t.name.toUpperCase() === 'GENERICO') && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-red-50 border-2 border-dashed border-red-100 p-6 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm group hover:border-red-200 transition-all">
          <div className="flex items-center gap-4 text-red-600">
            <div className="p-3 bg-red-100 rounded-2xl animate-pulse">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-sm font-black uppercase italic tracking-tight block">Times Genéricos Detectados</span>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest leading-none mt-1">Saneamento de dados necessário</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              if (confirm("ATENÇÃO: Deseja apagar todos os times genéricos do sistema?")) {
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
            className="bg-red-600 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-xl shadow-red-100 active:scale-95 shrink-0"
          >
            Limpar Registros
          </button>
        </motion.div>
      )}

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-blue transition-colors w-6 h-6" />
        <input 
          type="text" 
          placeholder="Pesquisar equipe pelo nome ou arena..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border-2 border-gray-100 rounded-3xl py-6 pl-16 pr-8 focus:outline-none focus:border-primary-blue transition-all text-primary-blue font-bold placeholder:text-gray-300 shadow-sm"
        />
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredTeams.length === 0 ? (
          <div className="col-span-full py-32 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 text-center flex flex-col items-center opacity-30">
            <Shield className="w-20 h-20 text-gray-400 mb-6" />
            <p className="text-gray-500 font-black uppercase tracking-[0.3em] italic">Nenhum time encontrado</p>
          </div>
        ) : (
          filteredTeams.map((team) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={team.id} 
              className="bg-white rounded-[2.5rem] border-2 border-gray-100 overflow-hidden group hover:border-primary-blue/30 hover:shadow-2xl transition-all shadow-sm relative"
            >
              <div className="p-10">
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="relative group-hover:scale-110 transition-transform duration-500 drop-shadow-2xl mb-6">
                    <SoccerJersey color={team.color} size={100} />
                    <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-xl border border-gray-100">
                      <Palette size={14} className="text-primary-blue" style={{ color: team.color }} />
                    </div>
                  </div>
                  <div className="w-full px-2">
                    <h3 className="text-2xl font-black italic uppercase text-primary-gray truncate leading-tight transition-colors group-hover:text-primary-blue">{team.name}</h3>
                    <div className="flex items-center justify-center gap-2 mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 px-4 py-2 rounded-full border border-gray-100 w-fit mx-auto">
                      <MapPin className="w-3.5 h-3.5 text-primary-blue" /> 
                      {getLocationName(team.locationId)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleEdit(team)}
                    className="flex-1 bg-white hover:bg-primary-blue text-primary-blue hover:text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border-2 border-primary-blue/10 active:scale-95 group/edit"
                  >
                    <Edit2 className="w-4 h-4 group-hover/edit:text-primary-yellow transition-colors" /> Detalhes
                  </button>
                  <button 
                    onClick={() => handleDelete(team.id)}
                    className="p-4 bg-gray-50 hover:bg-red-500 text-gray-400 hover:text-white rounded-2xl transition-all border border-gray-100 shadow-sm active:scale-95"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-primary-blue p-6 md:p-8 flex items-center justify-between text-white">
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">
                  {editingTeam ? 'Configurar Time' : 'Novo Time'}
                </h3>
                <button onClick={resetForm} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                <div className="flex justify-center p-6 bg-gray-50 rounded-3xl border border-gray-50 shadow-inner">
                  <SoccerJersey color={color} size={100} className="drop-shadow-2xl" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Identificação da Equipe</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray placeholder:text-gray-300 uppercase italic"
                      placeholder="EX: REAL MADRUGA"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest flex items-center justify-between pl-1">
                      Arena de Origem
                      {adminData?.role === 'master' && (
                        <Link to="/admin/locations" className="text-primary-blue hover:text-blue-700 normal-case font-black text-[9px] uppercase tracking-widest flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Gerenciar Arenas
                        </Link>
                      )}
                    </label>
                    <div className="relative">
                      <select 
                        required
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray appearance-none cursor-pointer"
                      >
                        <option value="" disabled>Selecione a arena oficial</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                      <MapPin className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none w-5 h-5" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Atletas/Time</label>
                      <input 
                        required
                        type="number" 
                        min="1"
                        max="20"
                        value={playerCount}
                        onChange={(e) => setPlayerCount(Number(e.target.value))}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Paleta Oficial</label>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-2x">
                        <div className="w-8 h-8 rounded-lg shadow-sm border border-white" style={{ backgroundColor: color }} />
                        <span className="text-[10px] font-black uppercase text-gray-500 font-mono">{color}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Selecione a Cor do Manto</label>
                    <div className="grid grid-cols-8 gap-2">
                      {JERSEY_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setColor(c.hex)}
                          className={`h-8 rounded-xl border-2 transition-all ${color === c.hex ? 'border-primary-blue scale-110 shadow-lg' : 'border-white shadow-sm hover:scale-105'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary-yellow" />
                      {editingTeam ? 'Salvar Uniforme' : 'Fundar Equipe'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
