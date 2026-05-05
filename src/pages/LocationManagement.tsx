import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Location } from '../types';
import { MapPin, Plus, Trash2, Edit2, Search, X, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';

export default function LocationManagement() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [playerCount, setPlayerCount] = useState<number>(5);
  const [gameDuration, setGameDuration] = useState<number>(60);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const locationData = {
      name,
      address,
      playerCount,
      gameDuration
    };

    try {
      if (editingLocation) {
        await updateDoc(doc(db, 'locations', editingLocation.id), locationData);
      } else {
        await addDoc(collection(db, 'locations'), locationData);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingLocation ? OperationType.UPDATE : OperationType.CREATE, 'locations');
    }
  };

  const resetForm = () => {
    setName('');
    setAddress('');
    setPlayerCount(5);
    setGameDuration(60);
    setEditingLocation(null);
    setIsModalOpen(false);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setName(location.name);
    setAddress(location.address || '');
    setPlayerCount(location.playerCount || 5);
    setGameDuration(location.gameDuration || 60);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este local?')) {
      try {
        await deleteDoc(doc(db, 'locations', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'locations');
      }
    }
  };

  const filteredLocations = locations.filter(l => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.address && l.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Locais</h2>
          <p className="text-gray-500 text-sm">Cadastre e gerencie os campos e arenas de jogo.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#00cc00] transition-all hover:scale-105"
        >
          <Plus className="w-5 h-5" /> Novo Local
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar local pelo nome ou endereço..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[#00ff00] transition-colors text-white"
        />
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredLocations.map((location) => (
          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={location.id} 
            className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden group hover:border-[#00ff00]/30 transition-all"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/5 p-3 rounded-xl">
                  <MapPin className="w-6 h-6 text-[#00ff00]" />
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleEdit(location)}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(location.id)}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold">{location.name}</h3>
                <div className="flex flex-wrap gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white/5 px-2 py-1 rounded-md">
                    <Search className="w-3 h-3 text-[#00ff00]" /> {location.playerCount || 5} Atletas/Time
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white/5 px-2 py-1 rounded-md">
                    <Search className="w-3 h-3 text-[#00ff00]" /> {location.gameDuration || 60} Minutos
                  </div>
                </div>
                {location.address && (
                  <p className="text-gray-500 text-sm flex items-start gap-2">
                    <Map className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {location.address}
                  </p>
                )}
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
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6 md:mb-8">
                  <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">
                    {editingLocation ? 'Editar Local' : 'Novo Local'}
                  </h3>
                  <button onClick={resetForm} className="p-2 hover:bg-white/5 rounded-full"><X /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Nome do Local</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#00ff00] text-white"
                      placeholder="Ex: Arena Central"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Endereço (Opcional)</label>
                    <textarea 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#00ff00] min-h-[80px] resize-none text-white"
                      placeholder="Rua Exemplo, 123 - Bairro"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Atletas por Time</label>
                      <input 
                        required
                        type="number" 
                        value={playerCount}
                        onChange={(e) => setPlayerCount(parseInt(e.target.value) || 0)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#00ff00] text-white"
                        placeholder="Ex: 5"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Tempo (Minutos)</label>
                      <input 
                        required
                        type="number" 
                        value={gameDuration}
                        onChange={(e) => setGameDuration(parseInt(e.target.value) || 0)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#00ff00] text-white"
                        placeholder="Ex: 60"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-[#00ff00] text-black py-4 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors mt-4"
                  >
                    {editingLocation ? 'Salvar Alterações' : 'Cadastrar Local'}
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
