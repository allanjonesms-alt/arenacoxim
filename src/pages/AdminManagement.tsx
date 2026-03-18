import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Admin, Location, AdminData } from '../types';
import { Plus, Trash2, ShieldCheck, Mail, User, MapPin, Loader2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';

interface AdminManagementProps {
  adminData?: AdminData | null;
}

export default function AdminManagement({ adminData }: AdminManagementProps) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [locationId, setLocationId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const qAdmins = query(collection(db, 'admins'), orderBy('createdAt', 'desc'));
    const unsubscribeAdmins = onSnapshot(qAdmins, (snapshot) => {
      let adminsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Admin));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        adminsList = adminsList.filter(a => a.locationId === adminData.locationId);
      }
      
      setAdmins(adminsList);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'admins'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      let locationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      
      // Filter locations if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        locationsList = locationsList.filter(l => l.id === adminData.locationId);
      }
      
      setLocations(locationsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    return () => {
      unsubscribeAdmins();
      unsubscribeLocations();
    };
  }, [adminData]);

  useEffect(() => {
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      setLocationId(adminData.locationId);
    }
  }, [adminData, isModalOpen]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, 'admins'), {
        name,
        email: email.toLowerCase().trim(),
        locationId,
        role: 'admin',
        createdAt: Date.now()
      });
      setIsModalOpen(false);
      setName('');
      setEmail('');
      setLocationId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'admins');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este administrador?')) return;
    try {
      await deleteDoc(doc(db, 'admins', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'admins');
    }
  };

  const filteredAdmins = admins.filter(admin => 
    (admin.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (admin.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const getLocationName = (id: string) => {
    return locations.find(l => l.id === id)?.name || 'Local não encontrado';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#00ff00]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Administradores</h2>
          <p className="text-gray-500 text-sm">Cadastre e gerencie os responsáveis pelos locais.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#00cc00] transition-all shadow-[0_0_20px_rgba(0,255,0,0.2)]"
        >
          <Plus className="w-5 h-5" /> Novo Administrador
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar por nome ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:border-[#00ff00] outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdmins.map((admin, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={admin.id} 
            className="bg-[#1a1a1a] p-6 rounded-2xl border border-white/5 hover:border-[#00ff00]/30 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="bg-white/5 p-3 rounded-xl text-[#00ff00]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <button 
                onClick={() => handleDeleteAdmin(admin.id)}
                className="p-2 text-gray-600 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tight">{admin.name}</h3>
                <div className="flex items-center gap-2 text-gray-500 text-xs mt-1">
                  <Mail className="w-3 h-3" />
                  <span>{admin.email}</span>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-[#00ff00]">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Responsável por:</span>
                </div>
                <div className="text-sm font-bold mt-1 text-gray-300">
                  {getLocationName(admin.locationId)}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Admin Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-[#1a1a1a] w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
            >
              <form onSubmit={handleAddAdmin} className="p-8 space-y-6">
                <div className="text-center">
                  <div className="bg-[#00ff00]/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-[#00ff00]" />
                  </div>
                  <h3 className="text-2xl font-black uppercase italic tracking-tight">Novo Administrador</h3>
                  <p className="text-gray-500 text-sm mt-1">Cadastre um novo responsável por local.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                      <User className="w-3 h-3" /> Nome Completo
                    </label>
                    <input 
                      required 
                      type="text" 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: João Silva"
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                      <Mail className="w-3 h-3" /> E-mail (Gmail)
                    </label>
                    <input 
                      required 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="usuario@gmail.com"
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                      <MapPin className="w-3 h-3" /> Local Responsável
                    </label>
                    <select 
                      required
                      value={locationId}
                      onChange={e => setLocationId(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none transition-all appearance-none"
                    >
                      <option value="" disabled className="bg-[#1a1a1a]">Selecione um local</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id} className="bg-[#1a1a1a]">{loc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-gray-500 hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-[#00cc00] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {saving ? 'Salvando...' : 'Cadastrar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
