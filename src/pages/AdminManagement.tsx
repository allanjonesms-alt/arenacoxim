import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, deleteDoc, query, orderBy, updateDoc } from 'firebase/firestore';
import { Admin, Location, AdminData } from '../types';
import { Plus, Trash2, ShieldCheck, Mail, User, MapPin, Loader2, Search, Edit2, X, CheckCircle2 } from 'lucide-react';
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
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);

  useEffect(() => {
    const qAdmins = query(collection(db, 'admins'), orderBy('name', 'asc'));
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
    if (isModalOpen && !editingAdmin) {
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        setLocationId(adminData.locationId);
      }
    }
  }, [adminData, isModalOpen, editingAdmin]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check for duplicate email
    const isDuplicate = admins.some(a => a.email.toLowerCase().trim() === normalizedEmail && a.id !== editingAdmin?.id);
    if (isDuplicate) {
      alert('Já existe um administrador cadastrado com este e-mail.');
      setSaving(false);
      return;
    }

    try {
      if (editingAdmin) {
        // Find if this is a UID doc or manual doc
        // Actually updateDoc works the same for both if we have the ID
        await updateDoc(doc(db, 'admins', editingAdmin.id), {
          name,
          email: normalizedEmail,
          locationId,
          role: 'admin'
        });
      } else {
        await addDoc(collection(db, 'admins'), {
          name,
          email: normalizedEmail,
          locationId,
          role: 'admin',
          createdAt: Date.now()
        });
      }
      
      setIsModalOpen(false);
      setName('');
      setEmail('');
      setLocationId('');
      setEditingAdmin(null);
    } catch (error) {
      handleFirestoreError(error, editingAdmin ? OperationType.UPDATE : OperationType.CREATE, 'admins');
    } finally {
      setSaving(false);
    }
  };

  const handleEditAdmin = (admin: Admin) => {
    setEditingAdmin(admin);
    setName(admin.name);
    setEmail(admin.email);
    setLocationId(admin.locationId);
    setIsModalOpen(true);
  };

  const handleDeleteAdmin = async (id: string) => {
    try {
      console.log('Attempting to delete admin:', id);
      await deleteDoc(doc(db, 'admins', id));
      console.log('Admin deleted successfully');
      alert('Administrador removido com sucesso!');
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Erro ao excluir: ' + (error.message || 'Sem permissão'));
      // handleFirestoreError(error, OperationType.DELETE, 'admins'); // Commented out to prevent app crash
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
        <Loader2 className="w-10 h-10 animate-spin text-primary-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-primary-blue">Staff</h2>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1 shadow-sm px-2 bg-gray-50 rounded-full inline-block">Administração de Sedes</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-blue text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 group"
        >
          <Plus className="w-5 h-5 text-primary-yellow transition-transform group-hover:rotate-12" /> Novo Admin
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-blue transition-colors w-6 h-6" />
        <input 
          type="text" 
          placeholder="Pesquisar administrador pelo nome ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border-2 border-gray-100 rounded-3xl py-6 pl-16 pr-8 focus:outline-none focus:border-primary-blue transition-all text-primary-blue font-bold placeholder:text-gray-300 shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredAdmins.length === 0 ? (
          <div className="col-span-full py-32 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 text-center flex flex-col items-center opacity-30">
            <ShieldCheck className="w-20 h-20 text-gray-400 mb-6" />
            <p className="text-gray-500 font-black uppercase tracking-[0.3em] italic">Nenhum administrador encontrado</p>
          </div>
        ) : (
          filteredAdmins.map((admin, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={admin.id} 
              className="bg-white rounded-[2.5rem] border-2 border-gray-100 overflow-hidden group hover:border-primary-blue/30 hover:shadow-2xl transition-all shadow-sm relative"
            >
              <div className="p-10">
                <div className="flex items-start justify-between mb-8">
                  <div className="flex gap-4">
                    <div className="bg-primary-blue/5 p-4 rounded-2xl text-primary-blue shadow-inner border border-primary-blue/10">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                      {admin.updatedAt ? (
                        <div className="bg-green-50 text-green-600 text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-green-100 w-fit drop-shadow-sm flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Ativo
                        </div>
                      ) : (
                        <div className="bg-orange-50 text-orange-600 text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-orange-100 w-fit drop-shadow-sm flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" /> Pendente
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEditAdmin(admin)}
                      className="p-3 bg-white hover:bg-primary-blue text-primary-blue hover:text-white rounded-xl transition-all border-2 border-primary-blue/10 shadow-sm group/btn active:scale-95"
                    >
                      <Edit2 className="w-4 h-4 group-hover/btn:text-primary-yellow transition-colors" />
                    </button>
                    <button 
                      onClick={() => handleDeleteAdmin(admin.id)}
                      className="p-3 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all border border-red-100 shadow-sm active:scale-95"
                      title="Remover Administrador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-primary-gray group-hover:text-primary-blue transition-colors truncate">{admin.name}</h3>
                    <div className="flex items-center gap-2 text-gray-400 font-bold text-[10px] mt-2 uppercase tracking-widest italic bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 w-fit">
                      <Mail className="w-3.5 h-3.5 text-primary-blue/40" />
                      <span>{admin.email}</span>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t-2 border-dashed border-gray-100">
                    <div className="flex items-center gap-3 text-primary-blue mb-2">
                      <div className="bg-primary-blue p-1.5 rounded-lg">
                        <MapPin className="w-3.5 h-3.5 text-primary-yellow" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Responsável por</span>
                    </div>
                    <div className="text-sm font-black uppercase italic text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-inner group-hover:bg-white transition-colors">
                      {getLocationName(admin.locationId)}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add Admin Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                setEditingAdmin(null);
                setName('');
                setEmail('');
                setLocationId('');
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-primary-blue p-8 flex items-center justify-between text-white">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-2xl">
                    <ShieldCheck className="w-8 h-8 text-primary-yellow" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">
                      {editingAdmin ? 'Editar Admin' : 'Novo Staff'}
                    </h3>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mt-0.5 whitespace-nowrap">
                      Gestão de acesso por arena
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingAdmin(null);
                    setName('');
                    setEmail('');
                    setLocationId('');
                  }}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-white/50 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddAdmin} className="p-8 space-y-6">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1 flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-primary-blue" /> Nome do Responsável
                    </label>
                    <input 
                      required 
                      type="text" 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="NOME COMPLETO"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-5 px-6 focus:outline-none focus:border-primary-blue transition-all font-black uppercase italic text-primary-blue placeholder:text-gray-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1 flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-primary-blue" /> E-mail Institucional (Google)
                    </label>
                    <input 
                      required 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="USUARIO@GMAIL.COM"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-5 px-6 focus:outline-none focus:border-primary-blue transition-all font-black uppercase italic text-primary-blue placeholder:text-gray-300"
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary-yellow" /> Unidade Vinculada
                    </label>
                    <div className="relative group/select">
                      <select 
                        required
                        value={locationId}
                        onChange={e => setLocationId(e.target.value)}
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-5 px-6 focus:outline-none focus:border-primary-blue transition-all appearance-none font-black uppercase italic text-primary-blue cursor-pointer"
                      >
                        <option value="" disabled>SELECIONE A ARENA</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name.toUpperCase()}</option>
                        ))}
                      </select>
                      <Plus className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 pointer-events-none group-focus-within/select:text-primary-blue transition-colors" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-primary-blue text-white py-6 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95 transition-all group"
                  >
                    {saving ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-primary-yellow group-hover:scale-110 transition-transform" />
                    )}
                    {saving ? 'PROCESSANDO...' : (editingAdmin ? 'ATUALIZAR ACESSO' : 'LIBERAR ACESSO')}
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
