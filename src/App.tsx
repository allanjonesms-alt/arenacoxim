import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, getDocFromServer, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Trophy, Users, Calendar, LayoutDashboard, LogIn, LogOut, Menu, X, ShieldCheck, MapPin, TrendingUp, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminData } from './types';

// Pages
import PublicDashboard from './pages/PublicDashboard';
import AdminPanel from './pages/AdminPanel';
import PlayerManagement from './pages/PlayerManagement';
import MatchManagement from './pages/MatchManagement';
import TeamManagement from './pages/TeamManagement';
import LocationManagement from './pages/LocationManagement';
import AdminManagement from './pages/AdminManagement';
import Tabelas from './pages/Tabelas';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  // Log simplified error for developers, but keep it clean
  console.error(`Error: ${operationType} on ${path} failed.`);
  throw new Error(message);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const MASTER_EMAIL = 'allanjonesms@gmail.com';

  useEffect(() => {
    // Test connection to Firestore
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      console.log("Current user:", currentUser?.email, currentUser?.uid);
      if (currentUser) {
        try {
          const isMaster = currentUser.email?.toLowerCase() === MASTER_EMAIL;
          console.log("Is master:", isMaster);
          
          // Check if user is admin in Firestore by UID
          const adminRef = doc(db, 'admins', currentUser.uid);
          let adminDoc = await getDoc(adminRef);
          let adminDataFromDoc = adminDoc.exists() ? adminDoc.data() as AdminData : null;
          console.log("Admin doc by UID exists:", adminDoc.exists(), adminDataFromDoc);

          // If not found by UID, check by email (for admins added via AdminManagement)
          if (!adminDataFromDoc && currentUser.email) {
            const normalizedEmail = currentUser.email.toLowerCase().trim();
            console.log("Checking by email:", normalizedEmail);
            const adminsQuery = query(
              collection(db, 'admins')
            );
            const querySnapshot = await getDocs(adminsQuery);
            const allAdmins = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log("All admins in DB:");
            console.table(allAdmins);
            
            const filteredAdmins = querySnapshot.docs.filter(d => {
              const data = d.data();
              return data.email?.toLowerCase().trim() === normalizedEmail;
            });
            
            console.log("Filtered admins by email:", filteredAdmins.map(d => d.data()));
            
            if (filteredAdmins.length > 0) {
              const docData = filteredAdmins[0].data() as AdminData;
              adminDataFromDoc = docData;
              console.log("Found admin by email (manual filter):", docData);
              
              // Optional: Migrate to UID-based document for faster lookups
              try {
                const oldDocId = filteredAdmins[0].id;
                await setDoc(adminRef, {
                  ...docData,
                  updatedAt: Date.now()
                });
                
                // Delete the old email-based document to prevent duplicates
                if (oldDocId !== currentUser.uid) {
                  await deleteDoc(doc(db, 'admins', oldDocId));
                }
                
                console.log("Migrated admin to UID-based doc and deleted legacy record");
              } catch (e) {
                console.error("Failed to migrate admin to UID-based doc:", e);
              }
            }
          }
          
          if (isMaster) {
            setIsAdmin(true);
            setAdminData({ role: 'master', locationId: null });
            
            // Bootstrap master admin if not exists
            if (!adminDataFromDoc) {
              try {
                await setDoc(adminRef, {
                  name: currentUser.displayName || 'Master Admin',
                  email: currentUser.email,
                  role: 'master',
                  locationId: 'all',
                  createdAt: Date.now()
                });
              } catch (e) {
                console.error("Failed to bootstrap master admin:", e);
              }
            }
          } else if (adminDataFromDoc) {
            console.log("Setting isAdmin to true for:", currentUser.email);
            setIsAdmin(true);
            setAdminData(adminDataFromDoc);
          } else {
            console.log("User is not an admin:", currentUser.email);
            setIsAdmin(false);
            setAdminData(null);
          }
        } catch (error) {
          console.error("Admin check failed:", error);
          const isMaster = currentUser.email?.toLowerCase() === MASTER_EMAIL;
          setIsAdmin(isMaster);
          setAdminData(isMaster ? { role: 'master', locationId: null } : null);
        }
      } else {
        setIsAdmin(false);
        setAdminData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00ff00]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#00ff00] selection:text-black">
    {/* Navigation */}
        <nav className="bg-[#1a1a1a] border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2">
                <Link to="/" className="flex items-center gap-2 group">
                  <div className="bg-[#00ff00] p-1.5 rounded-lg group-hover:scale-110 transition-transform">
                    <Trophy className="w-6 h-6 text-black" />
                  </div>
                  <span className="text-xl font-black tracking-tighter uppercase italic">
                    ARENA<span className="text-[#00ff00]">COXIM</span>
                  </span>
                </Link>
              </div>

              {/* Desktop Menu */}
              <div className="hidden md:flex items-center gap-6">
                <Link to="/" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> Resultados
                </Link>
                {isAdmin && (
                  <>
                    <Link to="/admin" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                      <LayoutDashboard className="w-4 h-4" /> Painel
                    </Link>
                    <Link to="/admin/players" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                      <Users className="w-4 h-4" /> Jogadores
                    </Link>
                    <Link to="/admin/teams" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" /> Times
                    </Link>
                    {adminData?.role === 'master' && (
                      <>
                        <Link to="/admin/locations" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                          <MapPin className="w-4 h-4" /> Locais
                        </Link>
                      </>
                    )}
                    <Link to="/admin/matches" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Partidas
                    </Link>
                    {adminData?.role === 'master' && (
                      <Link to="/admin/scoring" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider flex items-center gap-1">
                        <Trophy className="w-4 h-4" /> Regras
                      </Link>
                    )}
                  </>
                )}
                
                {user ? (
                  <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                    <div className="flex items-center gap-2">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-[#00ff00] object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full border border-[#00ff00] bg-white/5 flex items-center justify-center">
                          <UserIcon size={16} className="text-gray-600" />
                        </div>
                      )}
                      <span className="text-xs font-bold truncate max-w-[100px]">{user.displayName}</span>
                    </div>
                    <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-full transition-colors text-red-500">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-[#00ff00] text-black px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-[#00cc00] transition-colors"
                  >
                    <LogIn className="w-4 h-4" /> Entrar
                  </button>
                )}
              </div>

              {/* Mobile Menu Button */}
              <div className="md:hidden">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-[#00ff00]">
                  {isMenuOpen ? <X /> : <Menu />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden bg-[#1a1a1a] border-t border-white/10 overflow-hidden"
              >
                <div className="px-4 pt-2 pb-6 space-y-2">
                  <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                    <TrendingUp className="w-4 h-4 text-[#00ff00]" /> Resultados
                  </Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                        <LayoutDashboard className="w-4 h-4 text-[#00ff00]" /> Painel
                      </Link>
                      <Link to="/admin/players" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                        <Users className="w-4 h-4 text-[#00ff00]" /> Jogadores
                      </Link>
                      <Link to="/admin/teams" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                        <ShieldCheck className="w-4 h-4 text-[#00ff00]" /> Times
                      </Link>
                      {adminData?.role === 'master' && (
                        <>
                          <Link to="/admin/locations" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                            <MapPin className="w-4 h-4 text-[#00ff00]" /> Locais
                          </Link>
                          <Link to="/admin/admins" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                            <UserIcon className="w-4 h-4 text-[#00ff00]" /> Admins
                          </Link>
                        </>
                      )}
                      <Link to="/admin/matches" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                        <Calendar className="w-4 h-4 text-[#00ff00]" /> Partidas
                      </Link>
                      {adminData?.role === 'master' && (
                        <Link to="/admin/scoring" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">
                          <Trophy className="w-4 h-4 text-[#00ff00]" /> Regras
                        </Link>
                      )}
                    </>
                  )}
                  {user ? (
                    <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-500 hover:bg-white/5">Sair</button>
                  ) : (
                    <button onClick={handleLogin} className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-[#00ff00] hover:bg-white/5">Entrar</button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<PublicDashboard adminData={adminData} />} />
            {isAdmin && (
              <>
                <Route path="/admin" element={<AdminPanel adminData={adminData} />} />
                <Route path="/admin/players" element={<PlayerManagement adminData={adminData} adminId={user?.uid} />} />
                <Route path="/admin/teams" element={<TeamManagement adminData={adminData} />} />
                {adminData?.role === 'master' && (
                  <>
                    <Route path="/admin/locations" element={<LocationManagement />} />
                    <Route path="/admin/admins" element={<AdminManagement adminData={adminData} />} />
                  </>
                )}
                <Route path="/admin/matches" element={<MatchManagement adminData={adminData} />} />
                {adminData?.role === 'master' && (
                  <Route path="/admin/scoring" element={<Tabelas />} />
                )}
              </>
            )}
            <Route path="*" element={<div className="text-center py-20"><h1 className="text-4xl font-bold">404</h1><p className="text-gray-400">Página não encontrada ou acesso restrito.</p></div>} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-[#111] border-t border-white/5 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-[#00ff00]" />
              <span className="text-lg font-black tracking-tighter uppercase italic">
                ARENA<span className="text-[#00ff00]">COXIM</span>
              </span>
            </div>
            <p className="text-gray-500 text-sm">© 2026 ARENA COXIM - Gestão de Futebol Amador</p>
            {user && (
              <div className="mt-4 p-2 bg-white/5 rounded-lg text-[10px] text-gray-600 font-mono">
                Conectado como: {user.email} ({user.uid}) | Admin: {isAdmin ? 'Sim' : 'Não'}
              </div>
            )}
          </div>
        </footer>
      </div>
  );
}
