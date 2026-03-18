import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, getDocFromServer, collection, query, where, getDocs } from 'firebase/firestore';
import { Trophy, Users, Calendar, LayoutDashboard, LogIn, LogOut, Menu, X, ShieldCheck, AlertTriangle, MapPin, User as UserIcon } from 'lucide-react';
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

// Error Boundary
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-red-500/50 p-8 rounded-3xl max-w-md w-full text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-black uppercase italic">Algo deu errado</h2>
            <p className="text-gray-400 text-sm">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-500 text-white py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-red-600 transition-colors"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
      if (currentUser) {
        try {
          const isMaster = currentUser.email?.toLowerCase() === MASTER_EMAIL;
          
          // Check if user is admin in Firestore by UID
          const adminRef = doc(db, 'admins', currentUser.uid);
          let adminDoc = await getDoc(adminRef);
          let adminDataFromDoc = adminDoc.exists() ? adminDoc.data() as AdminData : null;

          // If not found by UID, check by email (for admins added via AdminManagement)
          if (!adminDataFromDoc && currentUser.email) {
            const adminsQuery = query(
              collection(db, 'admins'), 
              where('email', '==', currentUser.email.toLowerCase().trim())
            );
            const querySnapshot = await getDocs(adminsQuery);
            if (!querySnapshot.empty) {
              const docData = querySnapshot.docs[0].data() as AdminData;
              adminDataFromDoc = docData;
              
              // Optional: Migrate to UID-based document for faster lookups
              try {
                await setDoc(adminRef, {
                  ...docData,
                  updatedAt: Date.now()
                });
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
            setIsAdmin(true);
            setAdminData(adminDataFromDoc);
          } else {
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
    <ErrorBoundary>
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
                <Link to="/" className="hover:text-[#00ff00] transition-colors font-medium text-sm uppercase tracking-wider">Resultados</Link>
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
                  <Link to="/" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Resultados</Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Painel</Link>
                      <Link to="/admin/players" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Jogadores</Link>
                      <Link to="/admin/teams" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Times</Link>
                      {adminData?.role === 'master' && (
                        <>
                          <Link to="/admin/locations" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Locais</Link>
                          <Link to="/admin/admins" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Admins</Link>
                        </>
                      )}
                      <Link to="/admin/matches" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/5">Partidas</Link>
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
            <Route path="/" element={<PublicDashboard />} />
            {isAdmin && (
              <>
                <Route path="/admin" element={<AdminPanel adminData={adminData} />} />
                <Route path="/admin/players" element={<PlayerManagement adminData={adminData} />} />
                <Route path="/admin/teams" element={<TeamManagement adminData={adminData} />} />
                {adminData?.role === 'master' && (
                  <>
                    <Route path="/admin/locations" element={<LocationManagement />} />
                    <Route path="/admin/admins" element={<AdminManagement adminData={adminData} />} />
                  </>
                )}
                <Route path="/admin/matches" element={<MatchManagement adminData={adminData} />} />
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
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
