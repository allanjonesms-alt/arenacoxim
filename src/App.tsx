import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
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
import { Trophy, Users, Calendar, LayoutDashboard, LogIn, LogOut, Menu, X, ShieldCheck, MapPin, TrendingUp, User as UserIcon, Lock, Key, Eye, EyeOff, Loader2, Home, Star, Award, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminData, Location, Team, ScoringRules, Player } from './types';

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
import ScoreTable from './pages/ScoreTable';
import HomeHub from './pages/HomeHub';
import NewsManagement from './pages/NewsManagement';
import CardManagement from './pages/CardManagement';
import BannerManagement from './pages/BannerManagement';
import MasterBank from './pages/MasterBank';
import MonthlyAwardsManagement from './pages/MonthlyAwardsManagement';
import Diagnostic from './pages/Diagnostic';
import SimuladorConfrontos from './pages/SimuladorConfrontos';
import PublicMonthlyAwards from './pages/PublicMonthlyAwards';
import ApostasUsuario from './pages/ApostasUsuario';
import BancoUsuario from './pages/BancoUsuario';

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

import AdminOddsEngine from './pages/AdminOddsEngine';
import AdminBettingSettings from './pages/AdminBettingSettings';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [hasPendingTransactions, setHasPendingTransactions] = useState(false);

  // Listen to pending transactions in real-time for master admin
  useEffect(() => {
    if (adminData?.role !== 'master') {
      setHasPendingTransactions(false);
      return;
    }
    const q = query(
      collection(db, 'transactions'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPendingTransactions(!snapshot.empty);
    }, (err) => {
      console.error("Error listening to pending transactions:", err);
    });
    return () => unsubscribe();
  }, [adminData]);
  
  // Onboarding states for first-time login via Google
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isOnboardingPlayer, setIsOnboardingPlayer] = useState<boolean | null>(null);
  const [onboardingSearch, setOnboardingSearch] = useState('');
  const [allPlayersList, setAllPlayersList] = useState<Player[]>([]);
  const [selectedOnboardingPlayer, setSelectedOnboardingPlayer] = useState<Player | null>(null);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingSuccess, setOnboardingSuccess] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  // Check if user is linked to any player
  useEffect(() => {
    if (!user || !user.email || isAdmin) {
      setShowOnboarding(false);
      return;
    }

    const checkPlayerLink = async () => {
      try {
        const normalizedEmail = user.email!.toLowerCase().trim();
        const playersRef = collection(db, 'players');
        const q = query(playersRef, where('gmail', '==', normalizedEmail));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          const dismissedKey = `dismissed_onboarding_${normalizedEmail}`;
          const isDismissed = localStorage.getItem(dismissedKey);
          
          if (!isDismissed) {
            const allPlayersSnap = await getDocs(playersRef);
            const playersWithNoGmail = allPlayersSnap.docs
              .map(doc => ({ id: doc.id, ...doc.data() } as Player))
              .filter(p => !p.gmail || p.gmail.trim() === '');
            
            setAllPlayersList(playersWithNoGmail);
            setShowOnboarding(true);
            setIsOnboardingPlayer(null);
            setOnboardingSearch('');
            setSelectedOnboardingPlayer(null);
            setOnboardingSuccess(false);
            setOnboardingError(null);
          }
        }
      } catch (err) {
        console.error("Onboarding checking failed:", err);
      }
    };

    checkPlayerLink();
  }, [user, isAdmin]);

  const handleLinkPlayer = async () => {
    if (!selectedOnboardingPlayer || !user || !user.email) return;
    setOnboardingSubmitting(true);
    setOnboardingError(null);
    try {
      const normalizedEmail = user.email.toLowerCase().trim();
      const playerRef = doc(db, 'players', selectedOnboardingPlayer.id);
      await updateDoc(playerRef, { gmail: normalizedEmail });
      setOnboardingSuccess(true);
      setTimeout(() => {
        setShowOnboarding(false);
      }, 2000);
    } catch (err: any) {
      console.error("Failed to link player:", err);
      setOnboardingError(err.message || "Não foi possível vincular seu e-mail. Tente novamente.");
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handleDismissOnboarding = () => {
    if (user && user.email) {
      const normalizedEmail = user.email.toLowerCase().trim();
      const dismissedKey = `dismissed_onboarding_${normalizedEmail}`;
      localStorage.setItem(dismissedKey, 'true');
    }
    setShowOnboarding(false);
  };
  
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);
  
  const navigate = useNavigate();
  const routerLocation = useLocation();

  // Scroll to top on every route transition
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routerLocation.pathname]);

  const MASTER_EMAIL = 'allanjonesms@gmail.com';

  useEffect(() => {
    if (!user) {
      setUserBalance(0);
      return;
    }
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setUserBalance(snap.data().balance || 0);
      } else {
        setUserBalance(0);
      }
    }, (err) => {
      console.error("Error listening to user balance:", err);
    });
    return () => unsubscribe();
  }, [user]);

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
            let matchedDoc = !querySnapshot.empty ? querySnapshot.docs[0] : null;
            
            if (!matchedDoc) {
              // Fallback: search all admins if the exact match fails (case sensitivity issues in DB, or matching doc ID)
              console.log("Admin detection: No exact match, trying case-insensitive search and doc-ID match...");
              const allAdminsSnap = await getDocs(collection(db, 'admins'));
              const fuzzyMatch = allAdminsSnap.docs.find(d => 
                d.data().email?.toLowerCase().trim() === normalizedEmail ||
                d.id.toLowerCase().trim() === normalizedEmail
              );
              if (fuzzyMatch) {
                matchedDoc = fuzzyMatch;
                console.log("Admin detection: Found admin via fuzzy match:", fuzzyMatch.data());
              }
            }
            
            if (matchedDoc) {
              const docData = matchedDoc.data() as AdminData;
              // Normalize the email to lowercase inside the document when migrating
              const updatedData = {
                ...docData,
                email: normalizedEmail,
                updatedAt: Date.now()
              };
              
              adminDataFromDoc = updatedData;
              
              // CRITICAL: Migrate to UID-based document for faster lookups and better security
              try {
                const oldDocId = matchedDoc.id;
                console.log("Admin detection: Migrating admin from doc", oldDocId, "to UID doc", currentUser.uid);
                
                await setDoc(adminRef, updatedData);
                console.log("Admin detection: UID-based document created/updated.");
                
                if (oldDocId !== currentUser.uid) {
                  await deleteDoc(doc(db, 'admins', oldDocId));
                  console.log("Admin detection: Legacy record deleted.");
                }
              } catch (migrateError) {
                console.error("Admin detection: Migration failed (continuing anyway):", migrateError);
              }
            } else {
              console.warn("Admin detection: User not found in 'admins' collection.");
            }
          }
          
          if (isMaster) {
            setIsAdmin(true);
            
            // Always force master role and 'all' locations for MASTER_EMAIL to prevent lockout/filtering issues
            const masterData = {
              ...(adminDataFromDoc || {}),
              name: adminDataFromDoc?.name || currentUser.displayName || 'Master Admin',
              email: currentUser.email || MASTER_EMAIL,
              role: 'master' as const,
              locationId: 'all',
              createdAt: adminDataFromDoc?.createdAt || Date.now()
            };
            
            setAdminData(masterData as AdminData);
            
            // Bootstrap or update master admin if not matching
            if (!adminDataFromDoc || adminDataFromDoc.role !== 'master' || adminDataFromDoc.locationId !== 'all') {
              try {
                await setDoc(adminRef, masterData);
                console.log("Admin detection: Master admin record bootstrapped/verified in Firestore.");
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
        } catch (error: any) {
          console.warn("Admin check notice (using local fallback if offline):", error?.message || error);
          const isMaster = currentUser.email?.toLowerCase() === MASTER_EMAIL;
          setIsAdmin(isMaster);
          setAdminData(isMaster ? {
            name: currentUser.displayName || 'Master Admin',
            email: currentUser.email || MASTER_EMAIL,
            role: 'master',
            locationId: 'all',
            createdAt: Date.now()
          } as AdminData : null);
        }
      } else {
        setIsAdmin(false);
        setAdminData(null);
      }
      setLoading(false);
    });
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason && (
        (event.reason.message && event.reason.message.includes("Pending promise was never set")) ||
        (event.reason.toString && event.reason.toString().includes("Pending promise was never set")) ||
        (event.reason.code && event.reason.code.includes("auth/internal-error"))
      )) {
        console.warn("Caught and suppressed Firebase iframe rejection error gracefully:", event.reason);
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      unsubscribeLocations();
      unsubscribeTeams();
      unsubscribeScoring();
      unsubscribeAuth();
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setLoginError(null);
    try {
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
      navigate('/');
    } catch (error: any) {
      console.error("Login failed:", error);
      let errMsg = "Erro de login do Google.";
      if (error?.message?.includes("auth/internal-error") || error?.message?.includes("popup") || error?.code === "auth/internal-error") {
        errMsg = "Bloqueio do navegador/iframe: por segurança, faça login abrindo o app em uma nova aba.";
      } else if (error?.message) {
        errMsg = error.message;
      }
      setLoginError(errMsg);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const filteredOnboardingPlayers = allPlayersList.filter(p => {
    const searchLower = onboardingSearch.toLowerCase().trim();
    if (!searchLower) return false;
    return (p.name || '').toLowerCase().includes(searchLower) || 
           (p.nickname || '').toLowerCase().includes(searchLower);
  });

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
            <div className="flex flex-col items-center justify-center py-3 gap-3">
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

              {/* Header components: profile pic, logout and home button */}
              <div className="flex items-center gap-3 sm:gap-4">
                <Link 
                  to="/" 
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl border border-white/10 transition-all shadow-sm active:scale-95 hover:text-primary-yellow"
                  title="Ir para a Página Inicial"
                >
                  <Home className="w-4 h-4 text-primary-yellow" />
                  <span className="hidden sm:inline">Início</span>
                </Link>




                {user ? (
                  <div className="flex items-center gap-3">
                    {adminData?.role === 'master' && (
                      <Link
                        to="/admin/banco"
                        className="relative flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 border border-slate-700/50"
                        title="Banco Master - Gerenciar Transações"
                      >
                        <Wallet className="w-4 h-4 text-primary-yellow shrink-0" />
                        <span className="hidden md:inline">Banco Master</span>
                        {hasPendingTransactions && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-white"></span>
                          </span>
                        )}
                      </Link>
                    )}
                    <Link
                      to="/banco"
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 border border-emerald-400/20"
                      title="Ir para o Banco Arena Coxim"
                    >
                      <Wallet className="w-4 h-4 text-primary-yellow shrink-0 animate-pulse" />
                      <span>R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </Link>

                    <div className="flex items-center gap-2 bg-white/5 py-1 px-3 rounded-full border border-white/10">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt="" 
                          className="w-7 h-7 rounded-full border border-primary-yellow object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full border border-primary-yellow bg-white/10 flex items-center justify-center">
                          <UserIcon size={14} className="text-white" />
                        </div>
                      )}
                      <span className="text-xs font-black truncate max-w-[120px] hidden sm:inline">
                        {user.displayName || user.email?.split('@')[0]}
                      </span>
                    </div>
                    <button 
                      onClick={handleLogout} 
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 animate-in fade-in"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sair
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowLoginModal(true)}
                    className="flex items-center gap-2 bg-primary-yellow text-primary-blue px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-yellow-400 transition-all shadow-md active:scale-95 animate-in fade-in"
                  >
                    <LogIn className="w-4 h-4" /> Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 md:pb-8 ${routerLocation.pathname === '/' ? 'pt-0' : 'py-8'}`}>
          <Routes>
            <Route path="/" element={<HomeHub user={user} isAdmin={isAdmin} adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
            <Route path="/apostas" element={<ApostasUsuario user={user} isMaster={isAdmin && adminData?.role === 'master'} />} />
            <Route path="/banco" element={<BancoUsuario user={user} />} />
            <Route path="/dashboard" element={<PublicDashboard adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
            <Route path="/melhores-do-mes" element={<PublicMonthlyAwards />} />
            <Route path="/players" element={<PlayerManagement adminData={adminData} adminId={user?.uid} sharedLocations={locations} />} />
            <Route path="/resenha" element={<Resenha locations={locations} />} />
            <Route path="/score-table" element={<ScoreTable adminData={adminData} sharedLocations={locations} sharedScoringRules={scoringRules} />} />
            {isAdmin && (
              <>
                <Route path="/admin/arenabet" element={<SimuladorConfrontos adminData={adminData} />} />
                <Route path="/admin/banco" element={<MasterBank adminData={adminData} />} />
                <Route path="/admin" element={<AdminPanel adminData={adminData} />} />
                <Route path="/admin/score-table" element={<ScoreTable adminData={adminData} sharedLocations={locations} sharedScoringRules={scoringRules} />} />
                <Route path="/admin/players" element={<PlayerManagement adminData={adminData} adminId={user?.uid} sharedLocations={locations} />} />
                <Route path="/admin/teams" element={<TeamManagement adminData={adminData} sharedLocations={locations} />} />
                
                {adminData?.role === 'master' && (
                  <>
                    <Route path="/admin/odds-engine" element={<AdminOddsEngine />} />
                    <Route path="/admin/betting-settings" element={<AdminBettingSettings />} />
                    <Route path="/admin/locations" element={<LocationManagement />} />
                    <Route path="/admin/admins" element={<AdminManagement adminData={adminData} sharedLocations={locations} />} />
                  </>
                )}
                
                <Route path="/admin/matches" element={<MatchManagement adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
                <Route path="/admin/news" element={<NewsManagement />} />
                <Route path="/admin/banners" element={<BannerManagement />} />
                <Route path="/admin/awards" element={<MonthlyAwardsManagement adminData={adminData} locations={locations} />} />
                <Route path="/admin/awards" element={<MonthlyAwardsManagement adminData={adminData} locations={locations} />} />
                <Route path="/admin/cards" element={<CardManagement />} />                
                {adminData?.role === 'master' && (
                  <Route path="/admin/scoring" element={<Tabelas />} />
                )}
                
                <Route path="/resultados" element={<MatchHistory adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
              </>
            )}
            <Route path="/resultados" element={<MatchHistory adminData={adminData} sharedLocations={locations} sharedTeams={teams} sharedScoringRules={scoringRules} />} />
            <Route path="/diagnostico" element={<Diagnostic />} />
            <Route path="*" element={<div className="text-center py-20"><h1 className="text-4xl font-bold">404</h1><p className="text-gray-400">Página não encontrada ou acesso restrito.</p></div>} />
          </Routes>
        </main>

        {/* Menu Flutuante Inferior para Mobile */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-150 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] py-3 px-2 pb-[calc(10px+env(safe-area-inset-bottom))] md:hidden flex justify-around items-center">
          <Link
            to="/apostas"
            className={`flex flex-col items-center gap-1 flex-1 text-center transition-all ${
              routerLocation.pathname === '/apostas' || routerLocation.pathname === '/admin/arenabet'
                ? 'text-primary-blue font-black scale-105'
                : 'text-gray-400 font-semibold'
            }`}
          >
            <TrendingUp className={`w-5 h-5 ${routerLocation.pathname === '/apostas' || routerLocation.pathname === '/admin/arenabet' ? 'text-primary-blue' : ''}`} />
            <span className="text-[9px] uppercase tracking-wider font-extrabold">Apostas</span>
          </Link>

          <Link
            to="/players"
            className={`flex flex-col items-center gap-1 flex-1 text-center transition-all ${
              routerLocation.pathname === '/players' || routerLocation.pathname === '/admin/players'
                ? 'text-primary-blue font-black scale-105'
                : 'text-gray-400 font-semibold'
            }`}
          >
            <Users className={`w-5 h-5 ${routerLocation.pathname === '/players' || routerLocation.pathname === '/admin/players' ? 'text-primary-blue' : ''}`} />
            <span className="text-[9px] uppercase tracking-wider font-extrabold">Atletas</span>
          </Link>

          <Link
            to="/score-table"
            className={`flex flex-col items-center gap-1 flex-1 text-center transition-all ${
              routerLocation.pathname === '/score-table' || routerLocation.pathname === '/admin/score-table'
                ? 'text-primary-blue font-black scale-105'
                : 'text-gray-400 font-semibold'
            }`}
          >
            <Trophy className={`w-5 h-5 ${routerLocation.pathname === '/score-table' || routerLocation.pathname === '/admin/score-table' ? 'text-primary-blue' : ''}`} />
            <span className="text-[9px] uppercase tracking-wider font-extrabold">Tabela</span>
          </Link>

          <Link
            to="/melhores-do-mes"
            className={`flex flex-col items-center gap-1 flex-1 text-center transition-all ${
              routerLocation.pathname === '/melhores-do-mes' || routerLocation.pathname === '/admin/awards'
                ? 'text-primary-blue font-black scale-105'
                : 'text-gray-400 font-semibold'
            }`}
          >
            <Star className={`w-5 h-5 ${routerLocation.pathname === '/melhores-do-mes' || routerLocation.pathname === '/admin/awards' ? 'text-primary-blue' : ''}`} />
            <span className="text-[9px] uppercase tracking-wider font-extrabold">Melhores Mês</span>
          </Link>

          <Link
            to="/resenha"
            className={`flex flex-col items-center gap-1 flex-1 text-center transition-all ${
              routerLocation.pathname === '/resenha'
                ? 'text-primary-blue font-black scale-105'
                : 'text-gray-400 font-semibold'
            }`}
          >
            <Award className={`w-5 h-5 ${routerLocation.pathname === '/resenha' ? 'text-primary-blue' : ''}`} />
            <span className="text-[9px] uppercase tracking-wider font-extrabold">M. e Piores</span>
          </Link>
        </div>

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

                  {loginError && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 text-xs font-bold leading-normal text-center space-y-2">
                      <p>{loginError}</p>
                      <a 
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl uppercase text-[9px] font-black tracking-widest transition-colors cursor-pointer"
                      >
                        Abrir em Nova Aba
                      </a>
                    </div>
                  )}

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

        <AnimatePresence>
          {showOnboarding && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleDismissOnboarding}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden z-10"
              >
                {/* Header */}
                <div className="bg-primary-blue p-8 flex items-center justify-between text-white">
                  <div className="flex items-center gap-4">
                    <div className="bg-white/10 p-3 rounded-2xl">
                      <Trophy className="w-8 h-8 text-primary-yellow animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">Vincular Conta</h3>
                      <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mt-0.5">Arena Coxim Onboarding</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDismissOnboarding} 
                    className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-white/50 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                  {onboardingSuccess ? (
                    <div className="text-center py-8 space-y-4">
                      <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-100 animate-pulse">
                        <Trophy className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-black uppercase text-green-600 italic">Conta Vinculada!</h4>
                      <p className="text-gray-500 text-sm font-bold leading-relaxed px-4">
                        Seu e-mail foi salvo com sucesso em seu cadastro de atleta. Agora seu perfil está oficialmente conectado!
                      </p>
                    </div>
                  ) : isOnboardingPlayer === null ? (
                    <div className="space-y-6 text-center">
                      <p className="text-gray-600 text-sm font-bold leading-relaxed">
                        Olá! Identificamos que você fez login com a conta <span className="text-primary-blue font-black">{user?.email}</span>.
                      </p>
                      <h4 className="text-lg font-black uppercase text-primary-blue italic">Você é jogador cadastrado na Arena Coxim?</h4>
                      <div className="flex gap-4 pt-2">
                        <button
                          onClick={() => setIsOnboardingPlayer(true)}
                          className="flex-1 bg-primary-blue text-white py-4 rounded-2xl font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg active:scale-95 animate-pulse"
                        >
                          Sim, sou jogador
                        </button>
                        <button
                          onClick={handleDismissOnboarding}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-gray-500 text-xs font-bold leading-relaxed text-center">
                        Digite seu nome para encontrar seu cadastro de atleta e vincular seu e-mail.
                      </p>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest pl-1">Buscar Atleta</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="Digite seu nome ou apelido..."
                            value={onboardingSearch}
                            onChange={(e) => {
                              setOnboardingSearch(e.target.value);
                              setSelectedOnboardingPlayer(null);
                            }}
                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-primary-blue/5 focus:border-primary-blue/20 transition-all font-medium text-primary-gray"
                          />
                        </div>
                      </div>

                      {/* Autocomplete List */}
                      {onboardingSearch.trim().length > 0 && !selectedOnboardingPlayer && (
                        <div className="max-h-48 overflow-y-auto border border-gray-100 bg-white rounded-2xl shadow-inner divide-y divide-gray-50">
                          {filteredOnboardingPlayers.length > 0 ? (
                            filteredOnboardingPlayers.map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setSelectedOnboardingPlayer(p);
                                  setOnboardingSearch(`${p.name} (${p.nickname || p.name})`);
                                }}
                                className="w-full text-left py-3 px-4 hover:bg-blue-50/50 transition-colors flex flex-col cursor-pointer"
                              >
                                <span className="font-black text-xs uppercase text-gray-700 tracking-wide">{p.name}</span>
                                <span className="text-[10px] font-bold text-primary-blue uppercase tracking-widest mt-0.5">
                                  {p.nickname ? `${p.nickname} • ` : ''}{p.position.toUpperCase()}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="p-4 text-center text-xs text-gray-400 font-bold">
                              Nenhum atleta sem e-mail encontrado com este nome.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Selected Athlete confirmation block */}
                      {selectedOnboardingPlayer && (
                        <div className="bg-blue-50/50 border border-blue-100/50 rounded-2xl p-4 space-y-2">
                          <span className="text-[9px] font-black uppercase text-primary-blue/60 tracking-wider">Atleta Selecionado:</span>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-black text-sm uppercase text-gray-700 leading-tight">{selectedOnboardingPlayer.name}</p>
                              <p className="text-[10px] font-bold text-primary-blue uppercase tracking-widest mt-0.5">
                                {selectedOnboardingPlayer.nickname ? `${selectedOnboardingPlayer.nickname} • ` : ''}{selectedOnboardingPlayer.position.toUpperCase()}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedOnboardingPlayer(null);
                                setOnboardingSearch('');
                              }}
                              className="text-xs font-bold text-red-500 hover:underline"
                            >
                              Alterar
                            </button>
                          </div>
                        </div>
                      )}

                      {onboardingError && (
                        <p className="text-xs font-semibold text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">
                          {onboardingError}
                        </p>
                      )}

                      <div className="flex gap-4 pt-4">
                        <button
                          onClick={handleLinkPlayer}
                          disabled={!selectedOnboardingPlayer || onboardingSubmitting}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:hover:bg-green-600 shadow-lg active:scale-95"
                        >
                          {onboardingSubmitting ? 'Salvando...' : 'Confirmar e Vincular'}
                        </button>
                        <button
                          onClick={() => {
                            setIsOnboardingPlayer(null);
                            setSelectedOnboardingPlayer(null);
                            setOnboardingSearch('');
                          }}
                          disabled={onboardingSubmitting}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-500 px-6 py-4 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}
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
