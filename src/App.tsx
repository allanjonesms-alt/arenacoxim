import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User, 
  signInWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, getDocFromServer, collection, query, where, getDocs, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Trophy, Users, Calendar, LayoutDashboard, LogIn, LogOut, Menu, X, ShieldCheck, MapPin, TrendingUp, User as UserIcon, Lock, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminData, Location, Team, ScoringRules } from './types';

// Pages
import PublicDashboard from './pages/PublicDashboard';
import AdminPanel from './pages/AdminPanel';
import PlayerManagement from './pages/PlayerManagement';
import MatchManagement from './pages/MatchManagement';
import TeamManagement from './pages/TeamManagement';
import LocationManagement from './pages/LocationManagement';
import AdminManagement from './pages/AdminManagement';
import Tabelas from './pages/Tabelas';
import MatchHistory from './pages/MatchHistory';
import Resenha from './pages/Resenha';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Show an alert for write operations so the user gets UI feedback
  if (operationType === OperationType.CREATE || 
      operationType === OperationType.UPDATE || 
      operationType === OperationType.DELETE || 
      operationType === OperationType.WRITE) {
    alert(`Erro ao salvar dados: ${errInfo.error}`);
    throw new Error(JSON.stringify(errInfo));
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);
  
  const navigate = useNavigate();

  const MASTER_EMAIL = 'allanjonesms@gmail.com';

  useEffect(() => {
    // Listen to common data in real-time (centralized to avoid multiple listeners in pages)
    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
    }, async (err) => {
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
        const snap = await getDocs(collection(db, 'locations'));
        setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
      } else {
        handleFirestoreError(err, OperationType.LIST, 'locations');
      }
    });

    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      setTeams(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    }, async (err) => {
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
        const snap = await getDocs(collection(db, 'teams'));
        setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
      } else {
        handleFirestoreError(err, OperationType.LIST, 'teams');
      }
    });

    const unsubscribeScoring = onSnapshot(doc(db, 'settings', 'scoring'), (snapshot) => {
      if (snapshot.exists()) {
        setScoringRules(snapshot.data() as ScoringRules);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'settings/scoring'));

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
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
            console.log("Admin detection: Checking Firestore for email:", normalizedEmail);
            
            const adminsQuery = query(
              collection(db, 'admins'),
              where('email', '==', normalizedEmail)
            );
            
            const querySnapshot = await getDocs(adminsQuery);
            console.log("Admin detection: Query results count:", querySnapshot.size);
            
            if (!querySnapshot.empty) {
              const adminDoc = querySnapshot.docs[0];
              const docData = adminDoc.data() as AdminData;
              adminDataFromDoc = docData;
              console.log("Admin detection: Found admin by email query:", docData);
              
              // CRITICAL: Migrate to UID-based document for faster lookups and better security
              try {
                const oldDocId = adminDoc.id;
                console.log("Admin detection: Migrating admin from doc", oldDocId, "to UID doc", currentUser.uid);
                
                await setDoc(adminRef, {
                  ...docData,
                  updatedAt: Date.now()
                });
                
                if (oldDocId !== currentUser.uid) {
                  await deleteDoc(doc(db, 'admins', oldDocId));
                  console.log("Admin detection: Legacy record deleted.");
                }
              } catch (migrateError) {
                console.error("Admin detection: Migration failed (continuing anyway):", migrateError);
              }
            } else {
              // Fallback: search all admins if the exact match fails (case sensitivity issues in DB)
              console.log("Admin detection: No exact match, trying case-insensitive search...");
              const allAdminsSnap = await getDocs(collection(db, 'admins'));
              const fuzzyMatch = allAdminsSnap.docs.find(d => 
                d.data().email?.toLowerCase().trim() === normalizedEmail
              );
              
              if (fuzzyMatch) {
                adminDataFromDoc = fuzzyMatch.data() as AdminData;
                console.log("Admin detection: Found admin via fuzzy match:", adminDataFromDoc);
              } else {
                console.warn("Admin detection: User not found in 'admins' collection.");
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
    return () => {
      unsubscribeLocations();
      unsubscribeTeams();
      unsubscribeScoring();
      unsubscribeAuth();
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
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
                {!isAdmin && (
                  <>
                    <Link to="/players" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <Users className="w-4 h-4" /> Atletas
                    </Link>
                    <Link to="/resenha" className="hover:text-primary-yellow transition-colors font-bold text-sm uppercase tracking-wider flex items-center gap-1">
                      <Trophy className="w-4 h-4" /> Resenha
                    </Link>
                  </>
                )}
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
                      <span className="text-xs font-bold truncate max-w-[100px]">{user.displayName || user.email?.split('@')[0]}</span>
                    </div>
                    <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-200">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowLoginModal(true)}
                    className="flex items-center gap-2 bg-primary-yellow text-primary-blue px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider hover:bg-yellow-400 transition-all shadow-md active:scale-95"
                  >
                    <LogIn className="w-4 h-4" /> Login
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
                  {!isAdmin && (
                    <>
                      <Link to="/players" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <Users className="w-4 h-4 text-primary-yellow" /> Atletas
                      </Link>
                      <Link to="/resenha" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-bold hover:bg-white/5">
                        <Trophy className="w-4 h-4 text-primary-yellow" /> Resenha
                      </Link>
                    </>
                  )}
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
                    <button onClick={handleLogin} className="w-full text-left px-3 py-2 rounded-md text-base font-bold text-primary-yellow hover:bg-white/5">Login</button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<PublicDashboard adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
            <Route path="/players" element={<PlayerManagement adminData={adminData} adminId={user?.uid} sharedLocations={locations} />} />
            <Route path="/resenha" element={<Resenha locations={locations} />} />
            {isAdmin && (
              <>
                <Route path="/admin" element={<AdminPanel adminData={adminData} />} />
                <Route path="/admin/players" element={<PlayerManagement adminData={adminData} adminId={user?.uid} sharedLocations={locations} />} />
                <Route path="/admin/teams" element={<TeamManagement adminData={adminData} sharedLocations={locations} />} />
                {adminData?.role === 'master' && (
                  <>
                    <Route path="/admin/locations" element={<LocationManagement />} />
                    <Route path="/admin/admins" element={<AdminManagement adminData={adminData} sharedLocations={locations} />} />
                  </>
                )}
                <Route path="/admin/matches" element={<MatchManagement adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
                {adminData?.role === 'master' && (
                  <Route path="/admin/scoring" element={<Tabelas />} />
                )}
                <Route path="/resultados" element={<MatchHistory adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
              </>
            )}
            <Route path="/resultados" element={<MatchHistory adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
            <Route path="*" element={<div className="text-center py-20"><h1 className="text-4xl font-bold">404</h1><p className="text-gray-400">Página não encontrada ou acesso restrito.</p></div>} />
          </Routes>
        </main>

        {/* Modals */}
        <AnimatePresence>
          {showLoginModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowLoginModal(false)}
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
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">Acesso Admin</h3>
                      <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mt-0.5">Gestão Arena Coxim</p>
                    </div>
                  </div>
                  <button onClick={() => setShowLoginModal(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-white/50 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="text-center space-y-4">
                    <p className="text-gray-500 text-sm font-bold leading-relaxed px-4">
                      Para sua segurança, o acesso administrativo é restrito a contas Google autorizadas.
                    </p>
                  </div>

                  <button 
                    onClick={handleLogin}
                    className="w-full bg-white border-2 border-primary-blue text-primary-blue py-6 rounded-2xl font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all flex items-center justify-center gap-3 active:scale-[0.98] group shadow-xl shadow-blue-50"
                  >
                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Login com Google
                  </button>

                  <div className="pt-4 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-300">
                      Acesso monitorado • Arena Coxim
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
              <div className="mt-4 p-4 bg-gray-50 rounded-2xl text-[10px] text-gray-500 font-mono border border-gray-100 max-w-lg mx-auto overflow-hidden">
                <div className="flex flex-col gap-1 items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-primary-blue uppercase opacity-50">Email:</span>
                    <span className="font-bold">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-primary-blue uppercase opacity-50">UID:</span>
                    <span className="font-bold">{user.uid}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-black text-primary-blue uppercase opacity-50">Admin:</span>
                    <span className={`font-black uppercase italic ${isAdmin ? 'text-green-600' : 'text-red-500'}`}>
                      {isAdmin ? 'Sim (Autorizado)' : 'Não (Acesso Restrito)'}
                    </span>
                  </div>
                  {isAdmin && adminData && (
                    <div className="flex items-center gap-2">
                      <span className="font-black text-primary-blue uppercase opacity-50">Role:</span>
                      <span className="font-bold uppercase">{adminData.role}</span>
                      <span className="px-1 opacity-20">|</span>
                      <span className="font-black text-primary-blue uppercase opacity-50">Sede:</span>
                      <span className="font-bold uppercase truncate max-w-[150px]">{adminData.locationId || 'Todas'}</span>
                    </div>
                  )}
                  {!isAdmin && (
                    <p className="mt-2 text-[9px] text-red-400 font-black uppercase italic animate-pulse">
                      Peça ao Master para autorizar o email "{user.email?.toLowerCase().trim()}" no menu Staff.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </footer>
      </div>
  );
}
