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
                try {
                  if (oldDocId !== currentUser.uid) {
                    console.log("Attempting to delete old admin doc:", oldDocId);
                    await deleteDoc(doc(db, 'admins', oldDocId));
                    console.log("Deleted legacy record");
                  }
                } catch (deleteError) {
                  console.error("Failed to delete legacy admin record:", deleteError);
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
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-blue"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-primary-blue selection:text-white">
    {/* Navigation */}
        <nav className="bg-primary-blue text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2">
                <Link to="/" className="flex items-center gap-2 group">
                  <div className="bg-primary-yellow p-1.5 rounded-lg group-hover:scale-110 transition-transform shadow-md">
                    <Trophy className="w-6 h-6 text-primary-blue" />
                  </div>
                  <span className="text-xl font-black tracking-tighter uppercase italic">
                    ARENA<span className="text-primary-yellow">COXIM</span>
                  </span>
                </Link>
              </div>

              {/* Desktop Menu */}
              <div className="hidden md:flex items-center gap-6">
                <Link to="/" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> Resultados
                </Link>
                {isAdmin && (
                  <>
                    <Link to="/admin" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <LayoutDashboard className="w-4 h-4" /> Painel
                    </Link>
                    <Link to="/admin/players" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <Users className="w-4 h-4" /> Jogadores
                    </Link>
                    <Link to="/admin/teams" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" /> Times
                    </Link>
                    {adminData?.role === 'master' && (
                      <>
                        <Link to="/admin/locations" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                          <MapPin className="w-4 h-4" /> Locais
                        </Link>
                      </>
                    )}
                    <Link to="/admin/matches" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Partidas
                    </Link>
                    {adminData?.role === 'master' && (
                      <Link to="/admin/scoring" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                        <Trophy className="w-4 h-4" /> Regras
                      </Link>
                    )}
                  </>
                )}
                
                {user ? (
                  <div className="flex items-center gap-4 pl-4 border-l border-white/20">
                    <div className="flex items-center gap-2">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border-2 border-primary-yellow object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full border-2 border-primary-yellow bg-white/10 flex items-center justify-center">
                          <UserIcon size={16} className="text-white" />
                        </div>
                      )}
                      <span className="text-xs font-bold truncate max-w-[100px]">{user.displayName}</span>
                    </div>
                    <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-200">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-primary-yellow text-primary-blue px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-yellow-400 transition-all shadow-md active:scale-95"
                  >
                    <LogIn className="w-4 h-4" /> Entrar
                  </button>
                )}
              </div>

              {/* Mobile Menu Button */}
              <div className="md:hidden">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-primary-yellow">
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
                className="md:hidden bg-primary-blue border-t border-white/10 overflow-hidden"
              >
                <div className="px-4 pt-2 pb-6 space-y-2">
                  <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                    <TrendingUp className="w-4 h-4 text-primary-yellow" /> Resultados
                  </Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <LayoutDashboard className="w-4 h-4 text-primary-yellow" /> Painel
                      </Link>
                      <Link to="/admin/players" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <Users className="w-4 h-4 text-primary-yellow" /> Jogadores
                      </Link>
                      <Link to="/admin/teams" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <ShieldCheck className="w-4 h-4 text-primary-yellow" /> Times
                      </Link>
                      {adminData?.role === 'master' && (
                        <>
                          <Link to="/admin/locations" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                            <MapPin className="w-4 h-4 text-primary-yellow" /> Locais
                          </Link>
                          <Link to="/admin/admins" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                            <UserIcon className="w-4 h-4 text-primary-yellow" /> Admins
                          </Link>
                        </>
                      )}
                      <Link to="/admin/matches" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <Calendar className="w-4 h-4 text-primary-yellow" /> Partidas
                      </Link>
                      {adminData?.role === 'master' && (
                        <Link to="/admin/scoring" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                          <Trophy className="w-4 h-4 text-primary-yellow" /> Regras
                        </Link>
                      )}
                    </>
                  )}
                  {user ? (
                    <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-md text-base font-bold text-red-200 hover:bg-white/5">Sair</button>
                  ) : (
                    <button onClick={handleLogin} className="w-full text-left px-3 py-2 rounded-md text-base font-bold text-primary-yellow hover:bg-white/5">Entrar</button>
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
        <footer className="bg-white border-t border-gray-200 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-primary-blue" />
              <span className="text-lg font-black tracking-tighter uppercase italic text-primary-gray">
                ARENA<span className="text-primary-blue">COXIM</span>
              </span>
            </div>
            <p className="text-gray-400 text-sm font-medium">© 2026 ARENA COXIM - Gestão de Futebol Amador</p>
            {user && (
              <div className="mt-4 p-2 bg-gray-50 rounded-lg text-[10px] text-gray-400 font-mono border border-gray-100">
                Conectado como: {user.email} ({user.uid}) | Admin: {isAdmin ? 'Sim' : 'Não'}
              </div>
            )}
          </div>
        </footer>
      </div>
  );
}
