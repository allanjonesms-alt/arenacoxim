import { UserBettingDashboard } from '../components/UserBettingDashboard';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  Trophy, 
  Users, 
  Calendar, 
  LayoutDashboard, 
  ShieldCheck, 
  MapPin, 
  TrendingUp, 
  User as UserIcon, 
  Award, 
  FileText,
  Newspaper,
  Image,
  Trash2,
  Star, 
  X,
  Zap,
  ChevronRight,
  Dices
} from 'lucide-react';
import { motion } from 'motion/react';
import { AdminData, News, Location, Team, ScoringRules, Player, Card, BoostedBet } from '../types';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, where, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../App';
import PublicDashboard from './PublicDashboard';
import ShopeeBanner from '../components/ShopeeBanner';
import churrascoPoster from '../assets/images/churrasco_torneio_poster_1784130670700.jpg';

interface HomeHubProps {
  user: any;
  isAdmin: boolean;
  adminData: AdminData | null;
  sharedLocations?: Location[];
  sharedTeams?: Team[];
  sharedScoringRules?: ScoringRules | null;
}

export default function HomeHub({ user, isAdmin, adminData, sharedLocations = [], sharedTeams = [], sharedScoringRules = null }: HomeHubProps) {
  const isMaster = adminData?.role === 'master';
  const [showBettingModal, setShowBettingModal] = useState(false);
  const [showPromoPopup, setShowPromoPopup] = useState(() => {
    try {
      return !sessionStorage.getItem('dismissedChurrascoPromo');
    } catch {
      return true;
    }
  });
  const [news, setNews] = useState<News[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [boostedBets, setBoostedBets] = useState<BoostedBet[]>([]);
  const [activeTournament, setActiveTournament] = useState<{ id?: string; name: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [promoConfig, setPromoConfig] = useState({
    active: false,
    imageUrl: '',
    link: 'https://docs.google.com/forms/d/e/1FAIpQLSfJFjmpcdmGpk6Ayc_m6ksYbjY7REyDgTd1OHIbGFYAyNKEfQ/viewform?usp=header',
    title: '10º Torneio e Churrasco ACS',
    eventDate: '15 de Agosto',
    closingDate: '27 de Julho',
    description: 'Um dia de futebol, amizade e bom churrasco!'
  });

  useEffect(() => {
    const fetchPromoConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'promo_popup'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPromoConfig({
            active: data.active ?? false,
            imageUrl: data.imageUrl || '',
            link: data.link || 'https://docs.google.com/forms/d/e/1FAIpQLSfJFjmpcdmGpk6Ayc_m6ksYbjY7REyDgTd1OHIbGFYAyNKEfQ/viewform?usp=header',
            title: data.title || '10º Torneio e Churrasco ACS',
            eventDate: data.eventDate || '15 de Agosto',
            closingDate: data.closingDate || '27 de Julho',
            description: data.description || 'Um dia de futebol, amizade e bom churrasco!'
          });
        }
      } catch (e: any) {
        console.warn("Notice loading promo config in HomeHub (using default if offline):", e?.message || e);
      }
    };
    fetchPromoConfig();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
    const unsubscribeNews = onSnapshot(q, (snapshot) => {
      setNews(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as News)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'news'));

    // Real-time players cache to speed up home screen loading and avoid waterfalls
    let qPlayers = query(collection(db, 'players'));
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qPlayers = query(collection(db, 'players'), where('locationId', '==', adminData.locationId));
    }
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
      setPlayers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
    }, (err) => console.error("Error loading players in HomeHub:", err));

    const unsubscribeCards = onSnapshot(collection(db, 'cards'), (snapshot) => {
      setCards(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    }, (err) => console.error("Error loading cards in HomeHub:", err));

    const unsubscribeBoosted = onSnapshot(collection(db, 'boostedBets'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as BoostedBet[];
      setBoostedBets(list.filter(b => b.active !== false));
    }, (err) => console.error("Error loading boosted bets in HomeHub:", err));

    const unsubscribeTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const active = list.find((t: any) => t.status === 'em_andamento') || list[0];
      if (active && (active as any).name) {
        setActiveTournament({ id: active.id, name: (active as any).name });
      } else {
        setActiveTournament({ name: '10º Torneio e Churrasco ACS' });
      }
    }, (err) => console.error("Error loading tournaments in HomeHub:", err));

    return () => {
      unsubscribeNews();
      unsubscribePlayers();
      unsubscribeCards();
      unsubscribeBoosted();
      unsubscribeTournaments();
    };
  }, [adminData]);

  const handleDeleteNews = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'news', id));
    } catch (err: any) {
      console.error("Erro ao apagar notícia:", err);
      alert(`Falha ao excluir notícia!\nErro: ${err.code || 'Desconhecido'}\nDetalhe: ${err.message || String(err)}`);
    }
  };

  // Public menu cards
  const publicCards = [
    {
      title: 'Apostas\n ',
      icon: TrendingUp,
      to: '/apostas',
      gradient: 'from-purple-600 via-indigo-600 to-purple-800',
    },
    {
      title: 'Atletas\n ',
      icon: Users,
      to: '/players',
      gradient: 'from-emerald-500 to-teal-700',
    },
    {
      title: 'Tabela\nGeral',
      icon: Trophy,
      to: '/score-table',
      gradient: 'from-yellow-500 to-amber-600',
    },
    {
      title: 'Melhores\ndo Mês',
      icon: Star,
      to: '/melhores-do-mes',
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      title: 'Melhores\ne Piores',
      icon: Award,
      to: '/resenha',
      gradient: 'from-rose-500 to-red-600',
    }
  ];


  // Admin-only menu cards
  const adminCards = [
    {
      title: 'Partidas',
      icon: Calendar,
      to: '/admin/matches',
      gradient: 'from-rose-500 to-red-600',
    },
    {
      title: 'Gerenciar Atletas',
      icon: Users,
      to: '/admin/players',
      gradient: 'from-cyan-600 to-blue-700',
    },
    {
      title: 'Sorteio de Times',
      icon: Dices,
      to: '/admin/sorteio',
      gradient: 'from-emerald-600 to-teal-800',
    },
    {
      title: 'Gerenciar Torneios & Placares',
      icon: Trophy,
      to: '/admin/tournaments',
      gradient: 'from-amber-500 to-yellow-600',
    },
    {
      title: 'ArenaBet',
      icon: TrendingUp,
      to: '/admin/arenabet',
      gradient: 'from-purple-500 to-fuchsia-700',
    },
    {
      title: 'Painel Admin',
      icon: LayoutDashboard,
      to: '/admin',
      gradient: 'from-slate-700 to-slate-900',
    },
    {
      title: 'Tabela Geral',
      icon: Trophy,
      to: '/admin/score-table',
      gradient: 'from-yellow-500 to-amber-600',
    },
    {
      title: 'Gerenciar Times',
      icon: ShieldCheck,
      to: '/admin/teams',
      gradient: 'from-indigo-600 to-violet-700',
    },
    {
      title: 'Gerenciar Notícias',
      icon: Newspaper,
      to: '/admin/news',
      gradient: 'from-emerald-500 to-teal-700',
    },
    {
      title: 'Gerenciar CARDS',
      icon: Image,
      to: '/admin/cards',
      gradient: 'from-violet-600 to-purple-800',
    },
    {
      title: 'Melhores do Mês',
      icon: Star,
      to: '/admin/awards',
      gradient: 'from-yellow-500 to-amber-700',
    }
  ];

  // Master Admin cards
  const masterCards = [
    {
      title: 'Sedes e Locais',
      icon: MapPin,
      to: '/admin/locations',
      gradient: 'from-purple-600 to-fuchsia-800',
    },
    {
      title: 'Gerenciar Staff',
      icon: UserIcon,
      to: '/admin/admins',
      gradient: 'from-fuchsia-600 to-pink-700',
    },
    {
      title: 'Regras de Súmula',
      icon: FileText,
      to: '/admin/scoring',
      gradient: 'from-orange-500 to-red-500',
    }
  ];

  // Container variants for stagger animation
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="pb-4 pt-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Banner */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 lg:-mt-0">
         <ShopeeBanner className="rounded-none sm:rounded-b-2xl border-x-0 border-t-0" />
      </div>

      {/* Active Boosted Bets Section */}
      {boostedBets.length > 0 && (
        <div className="space-y-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 p-5 sm:p-6 rounded-[2rem] border border-amber-400/40 shadow-xl relative overflow-hidden my-4">
          <div className="absolute -right-12 -top-12 w-40 h-40 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="bg-amber-400/20 p-2 rounded-xl border border-amber-400/30">
                <Zap className="w-5 h-5 fill-amber-400 text-amber-400 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                  Apostas Turbinadas 
                  <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md shadow-xs not-italic">
                    ODDS ESPECIAIS 🚀
                  </span>
                </h3>
                <p className="text-xs text-amber-300/80 font-bold">Cotações especiais ativas na Arena</p>
              </div>
            </div>
            
            <Link
              to="/apostas"
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 shrink-0"
            >
              Ir para Apostas <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 relative z-10">
            {boostedBets.map((boost) => (
              <div
                key={boost.id}
                className="bg-slate-800/90 border border-amber-400/30 hover:border-amber-400 rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all hover:scale-[1.01] shadow-md group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md flex items-center gap-1 font-extrabold">
                      <Zap className="w-2.5 h-2.5 fill-slate-950" />
                      {boost.betType && !boost.betType.startsWith('COMBINADA') ? boost.betType : 'TURBINADA'}
                    </span>
                    <span className="text-lg font-black text-amber-300">
                      @ {Number(boost.odd).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  {boost.title && (
                    <h4 className="text-sm font-black uppercase text-amber-300 tracking-tight pt-0.5">
                      {boost.title}
                    </h4>
                  )}
                  <p className="text-xs font-black text-white leading-snug whitespace-pre-line">
                    {boost.displayText}
                  </p>
                </div>

                <Link
                  to="/apostas"
                  className="w-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-center flex items-center justify-center gap-1.5"
                >
                  Apostar Agora <TrendingUp className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* ArenaBet Featured Banner */}
      <div className="my-3 sm:my-4">
        <Link
          to="/apostas"
          className="group relative flex items-center justify-between w-full bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 hover:from-purple-800 hover:to-indigo-900 text-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xl border border-purple-500/30 transition-all hover:scale-[1.01] active:scale-[0.99] overflow-hidden gap-2.5 sm:gap-4"
        >
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

          <div className="flex items-center gap-2.5 sm:gap-3.5 relative z-10 min-w-0">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-md group-hover:rotate-6 transition-transform shrink-0">
              <TrendingUp className="w-5 h-5 sm:w-7 sm:h-7 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400/20 border border-amber-400/40 rounded-full text-amber-300 text-[9px] sm:text-[10px] font-black uppercase tracking-wider mb-0.5 sm:mb-1">
                <span>🔥 ArenaBet Ao Vivo</span>
              </div>
              <h3 className="text-xs sm:text-lg font-black uppercase italic tracking-tight text-white leading-tight truncate">
                Mercado de Apostas & Campeão
              </h3>
              <p className="text-xs text-purple-200/80 font-medium truncate hidden sm:block">
                Aposte nos jogos agendados e na equipe Campeã do Torneio ACS 2026!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-lg shrink-0 hover:from-amber-300 hover:to-amber-400 transition-all">
            <span>Apostar</span>
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      <div className="space-y-10">
        <div className="space-y-8">
          
          {/* 1. Botões Públicos (ocultos no mobile pois já existem na barra inferior) */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="hidden md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 md:gap-3 my-2.5"
          >
            {publicCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={idx} className="group">
                  <Link to={card.to} className="block w-full">
                    <div className={`relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-3 md:p-3.5 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg flex items-center justify-between border border-white/10 active:scale-95`}>
                      
                      {/* Visual pattern overlay */}
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      
                      <div className="flex items-center gap-2.5 relative z-10 w-full">
                        <div className="bg-white/10 p-2 rounded-xl w-9 h-9 md:w-10 md:h-10 flex-shrink-0 flex items-center justify-center border border-white/20">
                          <IconComponent className="w-4 h-4 md:w-5 md:h-5 text-primary-yellow" />
                        </div>
                        
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h3 className="text-xs md:text-sm font-black uppercase tracking-tight italic whitespace-pre-line leading-snug">
                            {card.title}
                          </h3>
                        </div>

                        <div className="flex-shrink-0 text-primary-yellow/80 group-hover:text-primary-yellow transition-colors group-hover:translate-x-1 text-xs">
                           <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>



      {/* Active Tournament Banner/Button above Results */}
      <div className="pt-2 border-t border-gray-100 mb-4">
        <Link
          to="/campeonato"
          className="group relative flex items-center justify-between w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg border border-amber-300/50 transition-all hover:scale-[1.01] active:scale-[0.99] overflow-hidden"
        >
          {/* Subtle glow background */}
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/20 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

          <div className="flex items-center gap-3 relative z-10 min-w-0">
            <div className="bg-slate-950 text-amber-400 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-md group-hover:rotate-6 transition-transform shrink-0">
              <Trophy className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-xl font-black uppercase italic tracking-tight text-slate-950 leading-tight truncate">
                {activeTournament?.name || '10º Torneio e Churrasco ACS'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-950 text-amber-400 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-md shrink-0 group-hover:bg-slate-900 ml-2">
            <span className="hidden sm:inline">Ver Tabela e Jogos</span>
            <span className="sm:hidden">Ver</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* 3. Seção Resultados e Jogos */}
        <div>
           <PublicDashboard 
             adminData={adminData}
             sharedLocations={sharedLocations}
             sharedTeams={sharedTeams}
             sharedScoringRules={sharedScoringRules}
             isCompact={true}
             sharedPlayers={players}
             sharedCards={cards}
             bottomMainContent={
               <div className="space-y-3 mt-4">
                 <h2 className="text-sm font-black uppercase tracking-widest italic text-primary-blue flex items-center justify-between">
                   <span className="flex items-center gap-2">
                     <Newspaper className="w-4 h-4" /> Destaques
                   </span>
                   {isAdmin && (
                     <Link to="/admin/news" className="text-xs text-emerald-600 hover:underline uppercase font-bold tracking-normal">
                       Gerenciar Notícias →
                     </Link>
                   )}
                 </h2>
                 {news.length > 0 ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {news.slice(0, 2).map(item => {
                       const CardContent = (
                         <>
                           {item.imageUrl && (
                             <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                              <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                             </div>
                           )}
                           <div className="flex flex-col flex-1 min-w-0 pr-6">
                             {item.date && (
                               <span className="text-[9px] font-black text-emerald-650 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider w-fit mb-1">
                                 {item.date} {item.time ? `às ${item.time}` : ''}
                               </span>
                             )}
                             <h3 className="text-sm font-black uppercase text-primary-blue line-clamp-2 leading-tight flex items-center gap-1">
                               {item.title}
                               {item.link && <span className="text-emerald-600 inline-block">↗</span>}
                             </h3>
                             <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">{item.content}</p>
                             {item.link && (
                               <span className="text-[9px] text-emerald-600 font-bold mt-1 inline-block hover:underline">
                                 Ler notícia completa ↗
                               </span>
                             )}
                           </div>
                           {isAdmin && (
                             <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="absolute top-4 right-4 z-20">
                               {confirmDeleteId === item.id ? (
                                 <div className="bg-white border border-rose-150 p-2 rounded-2xl flex items-center gap-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-150">
                                   <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter mr-1">Apagar?</span>
                                   <button
                                     onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       handleDeleteNews(item.id);
                                       setConfirmDeleteId(null);
                                     }}
                                     className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded-xl shadow-sm transition-all"
                                   >
                                     Sim
                                   </button>
                                   <button
                                     onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       setConfirmDeleteId(null);
                                     }}
                                     className="bg-gray-100 hover:bg-gray-200 text-gray-500 text-[9px] font-black uppercase px-2 py-1 rounded-xl transition-all"
                                   >
                                     Não
                                   </button>
                                 </div>
                               ) : (
                                 <button
                                   onClick={(e) => {
                                     e.preventDefault();
                                     e.stopPropagation();
                                     setConfirmDeleteId(item.id);
                                   }}
                                   title="Excluir Notícia"
                                   className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </button>
                               )}
                             </div>
                           )}
                         </>
                       );

                       if (item.link) {
                         return (
                           <a 
                             key={item.id} 
                             href={item.link} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="flex bg-white rounded-2xl p-4 border border-gray-150 shadow-sm gap-4 items-center relative group hover:border-emerald-250 hover:shadow-md transition-all cursor-pointer"
                           >
                             {CardContent}
                           </a>
                         );
                       }

                       return (
                         <div key={item.id} className="flex bg-white rounded-2xl p-4 border border-gray-150 shadow-sm gap-4 items-center relative group">
                           {CardContent}
                         </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col gap-2 items-center justify-center text-center">
                     <Newspaper className="w-8 h-8 text-gray-300" />
                     <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Nenhum destaque no momento</p>
                   </div>
                 )}
               </div>
             }
           />
        </div>

      {/* Admin Pages Section */}
      {isAdmin && (
        <div className="space-y-6 pt-4 border-t border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black uppercase italic tracking-wider text-primary-blue flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" /> Ferramentas Administrativas
              </h2>
              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">
                Acesso Liberado
              </span>
            </div>
            <p className="text-gray-400 text-xs font-semibold mt-1">Gerenciamento de times, gols, súmulas e dados pontuais de atletas por região.</p>
          </div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {adminCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={idx} className="group">
                  <Link to={card.to} className="block h-full">
                    <div className={`relative h-full overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-3.5 sm:p-4 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md flex flex-col justify-between border border-white/10 active:scale-95`}>
                      
                      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/5 rounded-full blur-lg group-hover:scale-125 transition-transform" />
                      
                      <div className="space-y-2.5 relative z-10 flex-grow">
                        <div className="bg-white/10 p-2 sm:p-2.5 rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border border-white/20">
                          <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        
                        <div>
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight italic leading-tight">
                            {card.title}
                          </h3>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#F9D423] opacity-90 group-hover:opacity-100 group-hover:underline">
                        Acessar <motion.span animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}

            {isMaster && masterCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={`master-${idx}`} className="group">
                  <Link to={card.to} className="block h-full">
                    <div className={`relative h-full overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} text-white p-3.5 sm:p-4 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md flex flex-col justify-between border border-white/10 active:scale-95`}>
                      
                      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-white/5 rounded-full blur-lg group-hover:scale-125 transition-transform" />
                      
                      <div className="space-y-2.5 relative z-10 flex-grow">
                        <div className="bg-white/10 p-2 sm:p-2.5 rounded-xl w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border border-white/20">
                          <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 text-primary-yellow" />
                        </div>
                        
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight italic leading-tight">
                            {card.title}
                          </h3>
                          <span className="bg-white/20 text-white text-[7px] sm:text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded">
                            Master
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-primary-yellow group-hover:underline">
                        Acessar Master <motion.span animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* Fast Sign-in callout if not admin to introduce logins */}
      {!user && (
        <div className="p-8 rounded-[2rem] bg-gray-50 border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <h4 className="text-lg font-extrabold text-primary-blue">Você é membro da comissão técnica?</h4>
            <p className="text-gray-500 text-xs font-semibold leading-relaxed">
              Faça login utilizando sua conta Google credenciada para acessar as ferramentas administrativas.
            </p>
          </div>
          <span className="text-xs text-gray-400 font-extrabold uppercase italic shrink-0">
            Botão de acesso no canto superior direito ↗
          </span>
        </div>
      )}

      {/* Pop-up de Promoção do Torneio e Churrasco ACS */}
      {showPromoPopup && promoConfig.active && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="relative bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            
            {/* Header / Title */}
            <div className="flex-shrink-0 bg-primary-blue text-white p-4 flex items-center justify-between">
              <h3 className="font-black text-sm uppercase tracking-wider italic flex items-center gap-2 text-primary-yellow">
                <Trophy className="w-5 h-5 text-primary-yellow" />
                {promoConfig.title}
              </h3>
              <button 
                onClick={() => {
                  setShowPromoPopup(false);
                  try {
                    sessionStorage.setItem('dismissedChurrascoPromo', 'true');
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Poster image & CTA */}
            <div className="overflow-y-auto p-5 flex flex-col items-center gap-4 text-center">
              <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-gray-50 aspect-[3/4] relative">
                <img 
                  src={promoConfig.imageUrl || churrascoPoster} 
                  alt="Cartaz do Evento" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="space-y-1">
                <h4 className="font-black text-primary-blue text-base uppercase italic leading-tight">
                  {promoConfig.description}
                </h4>
                {promoConfig.closingDate && (
                  <p className="text-xs text-gray-500 font-bold max-w-sm">
                    Inscrições/Fechamento da lista dia: <span className="text-rose-600 font-black">{promoConfig.closingDate}</span>.
                  </p>
                )}
                {promoConfig.eventDate && (
                  <p className="text-xs text-gray-400 font-bold max-w-sm">
                    Data do Evento: <span className="text-primary-blue font-black">{promoConfig.eventDate}</span>.
                  </p>
                )}
              </div>
            </div>

            {/* Footer with actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setShowPromoPopup(false);
                  try {
                    sessionStorage.setItem('dismissedChurrascoPromo', 'true');
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex-1 order-2 sm:order-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
              >
                Fechar
              </button>
              <a
                href={promoConfig.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setShowPromoPopup(false);
                  try {
                    sessionStorage.setItem('dismissedChurrascoPromo', 'true');
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex-1 order-1 sm:order-2 bg-primary-blue hover:bg-blue-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 shadow-md shadow-blue-100"
              >
                Inscrição Online →
              </a>
            </div>

          </div>
        </div>
      )}

      </div>
    </div>
  );
}
