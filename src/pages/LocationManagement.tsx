import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Location } from '../types';
import { MapPin, Plus, Trash2, Edit2, Search, X, Map, Users, Clock, CheckCircle2, Shield } from 'lucide-react';
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
  const [logoUrl, setLogoUrl] = useState('');
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
      logoUrl,
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
    setLogoUrl('');
    setPlayerCount(5);
    setGameDuration(60);
    setEditingLocation(null);
    setIsModalOpen(false);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setName(location.name);
    setAddress(location.address || '');
    setLogoUrl(location.logoUrl || '');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit for base64 storage
        alert('Imagem muito grande. Máximo 500KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredLocations = locations.filter(l => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.address && l.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-primary-blue">Arenas</h2>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1 shadow-sm px-2 bg-gray-50 rounded-full inline-block">Gestão de Campos e Sedes</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-blue text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 group"
        >
          <Plus className="w-5 h-5 text-primary-yellow transition-transform group-hover:rotate-12" /> Novo Local
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-blue transition-colors w-6 h-6" />
        <input 
          type="text" 
          placeholder="Pesquisar arena pelo nome ou endereço..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border-2 border-gray-100 rounded-3xl py-6 pl-16 pr-8 focus:outline-none focus:border-primary-blue transition-all text-primary-blue font-bold placeholder:text-gray-300 shadow-sm"
        />
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredLocations.length === 0 ? (
          <div className="col-span-full py-32 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 text-center flex flex-col items-center opacity-30">
            <MapPin className="w-20 h-20 text-gray-400 mb-6" />
            <p className="text-gray-500 font-black uppercase tracking-[0.3em] italic">Nenhum local encontrado</p>
          </div>
        ) : (
          filteredLocations.map((location) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={location.id} 
              className="bg-white rounded-[2.5rem] border-2 border-gray-100 overflow-hidden group hover:border-primary-blue/30 hover:shadow-2xl transition-all shadow-sm relative"
            >
              <div className="p-6 md:p-10">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 relative">
                  <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                    <div className="bg-gray-50 p-2 rounded-2xl md:rounded-[1.75rem] w-20 h-20 md:w-24 md:h-24 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-100 group-hover:border-primary-blue/20 transition-all shadow-inner bg-white flex-shrink-0">
                      {location.logoUrl ? (
                        <img src={location.logoUrl} alt={location.name} className="w-full h-full object-contain p-1 md:p-2" />
                      ) : (
                        <MapPin className="w-8 h-8 md:w-10 md:h-10 text-gray-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl md:text-2xl font-black italic uppercase text-primary-gray leading-tight truncate group-hover:text-primary-blue transition-colors">{location.name}</h3>
                      <div className="flex items-center gap-1.5 mt-2 text-primary-yellow">
                        {[...Array(5)].map((_, i) => (
                          <Shield key={i} size={10} className="fill-current" />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex md:flex-col gap-2 md:gap-3 absolute top-0 right-0 md:relative md:top-auto md:right-auto">
                    <button 
                      onClick={() => handleEdit(location)}
                      className="p-2.5 md:p-3 bg-white hover:bg-primary-blue text-primary-blue hover:text-white rounded-xl transition-all border-2 border-primary-blue/10 shadow-sm group/btn active:scale-95"
                    >
                      <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover/btn:text-primary-yellow transition-colors" />
                    </button>
                    <button 
                      onClick={() => handleDelete(location.id)}
                      className="p-2.5 md:p-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all border border-red-100 shadow-sm active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                      <Users className="w-3.5 h-3.5 text-primary-blue" /> {location.playerCount || 5} Atletas/Time
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                      <Clock className="w-3.5 h-3.5 text-primary-yellow" /> {location.gameDuration || 60} Minutos
                    </div>
                  </div>
                  {location.address && (
                    <div className="bg-gray-50/50 p-5 rounded-2xl border border-dotted border-gray-200 group-hover:bg-gray-50 transition-colors">
                      <p className="text-gray-400 text-[10px] font-bold flex items-start gap-3 leading-relaxed italic">
                        <Map className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-blue/30" />
                        {location.address}
                      </p>
                    </div>
                  )}
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
                  {editingLocation ? 'Perfil da Arena' : 'Nova Arena'}
                </h3>
                <button onClick={resetForm} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Logo Upload */}
                  <div className="flex flex-col items-center gap-6 p-6 border border-gray-100 bg-gray-50 rounded-3xl shadow-inner">
                    <div className="w-32 h-32 rounded-3xl bg-white flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm group">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain p-2" />
                      ) : (
                        <MapPin className="w-10 h-10 text-gray-100" />
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-3">
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleFileChange}
                          className="hidden" 
                          id="logo-upload"
                        />
                        <label 
                          htmlFor="logo-upload"
                          className="bg-primary-blue text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                        >
                          {logoUrl ? 'Trocar Logotipo' : 'Enviar Logotipo'}
                        </label>
                        {logoUrl && (
                          <button 
                            type="button" 
                            onClick={() => setLogoUrl('')}
                            className="bg-white border border-red-100 text-red-500 p-2.5 rounded-xl hover:bg-red-50 transition-all"
                            title="Remover Logo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Máximo 500KB</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Nome da Arena</label>
                    <input 
                      required
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray placeholder:text-gray-300 uppercase italic"
                      placeholder="EX: ARENA CENTRAL"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Endereço Geográfico</label>
                    <textarea 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray min-h-[100px] resize-none placeholder:text-gray-300"
                      placeholder="Rua Exemplo, 123 - Bairro"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Atletas/Time</label>
                      <input 
                        required
                        type="number" 
                        value={playerCount}
                        onChange={(e) => setPlayerCount(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Duração (Min)</label>
                      <input 
                        required
                        type="number" 
                        value={gameDuration}
                        onChange={(e) => setGameDuration(parseInt(e.target.value) || 0)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary-yellow" />
                      {editingLocation ? 'Salvar Arena' : 'Inaugurar Arena'}
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
