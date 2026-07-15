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
  Trash2
, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import { AdminData, News, Location, Team, ScoringRules, Player, Card } from '../types';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../App';
import PublicDashboard from './PublicDashboard';
import { ScheduledMatchesOdds } from '../components/ScheduledMatchesOdds';
import ShopeeBanner from '../components/ShopeeBanner';

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
  const [news, setNews] = useState<News[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    return () => {
      unsubscribeNews();
      unsubscribePlayers();
      unsubscribeCards();
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

  // Public menu cards (reduced to 2)
  const publicCards = [
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
      title: 'Apostas',
      subtitle: 'Escale equipes, calcule probabilidades e odds de confrontos.',
      icon: TrendingUp,
      to: '/admin/simulador',
      gradient: 'from-purple-500 to-fuchsia-700',
    },
    {
      title: 'Gerenciar Atletas',
      subtitle: 'Cadastrar novos atletas, editar notas de overall e posições.',
      icon: Users,
      to: '/admin/players',
      gradient: 'from-cyan-600 to-blue-700',
    },
    {
      title: 'Rodadas & Partidas',
      subtitle: 'Inserir dados das partidas, gols, assistências e súmulas.',
      icon: Calendar,
      to: '/admin/matches',
      gradient: 'from-rose-500 to-red-600',
    },
    {
      title: 'Painel Admin',
      subtitle: 'Controle geral do sistema e relatório de atividades.',
      icon: LayoutDashboard,
      to: '/admin',
      gradient: 'from-slate-700 to-slate-900',
    },
    {
      title: 'Tabela Geral',
      subtitle: 'Classificação cumulativa de pontuação total por local.',
      icon: Trophy,
      to: '/admin/score-table',
      gradient: 'from-yellow-500 to-amber-600',
    },
    {
      title: 'Gerenciar Times',
      subtitle: 'Criar, organizar, dar cores e escalar elencos.',
      icon: ShieldCheck,
      to: '/admin/teams',
      gradient: 'from-indigo-600 to-violet-700',
    },
    {
      title: 'Gerenciar Notícias',
      subtitle: 'Adicionar ou remover destaques rápidos.',
      icon: Newspaper,
      to: '/admin/news',
      gradient: 'from-emerald-500 to-teal-700',
    },
    {
      title: 'Gerenciar CARDS',
      subtitle: 'Upload e customização de fundos de cartas.',
      icon: Image,
      to: '/admin/cards',
    },
    {
      title: 'Melhores do Mês',
      subtitle: 'Gerenciar os destaques mensais e cartas bônus.',
      icon: Star,
      to: '/admin/awards',
      gradient: 'from-yellow-500 to-amber-700',
    }
  ];

  // Master Admin cards
  const masterCards = [
    {
      title: 'Sedes e Locais',
      subtitle: 'Gerenciar arenas, quadras esportivas e brasões.',
      icon: MapPin,
      to: '/admin/locations',
      gradient: 'from-purple-600 to-fuchsia-800',
    },
    {
      title: 'Gerenciar Staff',
      subtitle: 'Conceder acessos de administrador por email oficial.',
      icon: UserIcon,
      to: '/admin/admins',
      gradient: 'from-fuchsia-600 to-pink-700',
    },
    {
      title: 'Regras de Súmula',
      subtitle: 'Ajustar pontuações de gols, assistências e vitórias.',
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
      
      <div className="space-y-10">
        <div className="space-y-8">
          
          {user && (
        <div className="py-2 flex justify-center">
          <button 
            onClick={() => setShowBettingModal(true)}
            className="bg-primary-blue text-white px-8 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-900 transition-all shadow-md active:scale-95 flex items-center justify-center gap-3 w-full max-w-sm border border-white/10"
          >
            <TrendingUp className="w-5 h-5 text-primary-yellow" />
            Apostas
          </button>
        </div>
      )}
      
      {/* 1. Botões Públicos */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4"
          >
            {publicCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={idx} className="group">
                  <Link to={card.to} className="block w-full">
                    <div className={`relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${card.gradient} text-white p-5 md:p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg flex items-center justify-between border border-white/10 active:scale-95`}>
                      
                      {/* Visual pattern overlay */}
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      
                      <div className="flex items-center gap-4 relative z-10 w-full">
                        <div className="bg-white/10 p-3 rounded-2xl w-12 h-12 flex-shrink-0 flex items-center justify-center border border-white/20">
                          <IconComponent className="w-6 h-6 text-primary-yellow" />
                        </div>
                        
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h3 className="text-base md:text-lg font-black uppercase tracking-tight italic whitespace-pre-line leading-tight">
                            {card.title}
                          </h3>
                        </div>

                        <div className="flex-shrink-0 text-primary-yellow/80 group-hover:text-primary-yellow transition-colors group-hover:translate-x-1">
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



      {/* Seção Odds Agendadas */}
        <ScheduledMatchesOdds teams={sharedTeams} players={players} cards={cards} />

      {/* 3. Seção Resultados e Jogos */}
        <div className="pt-2 border-t border-gray-100">
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
                     {news.slice(0, 2).map(item => (
                       <div key={item.id} className="flex bg-white rounded-2xl p-4 border border-gray-100 shadow-sm gap-4 items-center relative group">
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
                           <h3 className="text-sm font-black uppercase text-primary-blue line-clamp-2 leading-tight">{item.title}</h3>
                           <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">{item.content}</p>
                         </div>
                         {isAdmin && (
                           confirmDeleteId === item.id ? (
                             <div className="absolute top-3 right-3 bg-white border border-rose-150 p-2 rounded-2xl flex items-center gap-1.5 shadow-lg z-10 animate-in fade-in zoom-in-95 duration-150">
                               <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter mr-1">Apagar?</span>
                               <button
                                 onClick={() => {
                                   handleDeleteNews(item.id);
                                   setConfirmDeleteId(null);
                                 }}
                                 className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded-xl shadow-sm transition-all"
                               >
                                 Sim
                               </button>
                               <button
                                 onClick={() => setConfirmDeleteId(null)}
                                 className="bg-gray-100 hover:bg-gray-200 text-gray-500 text-[9px] font-black uppercase px-2 py-1 rounded-xl transition-all"
                               >
                                 Não
                               </button>
                             </div>
                           ) : (
                             <button
                               onClick={() => setConfirmDeleteId(item.id)}
                               title="Excluir Notícia"
                               className="absolute top-4 right-4 p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           )
                         )}
                       </div>
                     ))}
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

            {showBettingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col">
            <div className="flex-shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-100 p-4 flex items-center justify-between z-20">
              <h3 className="font-black text-lg text-primary-blue flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-yellow" />
                Apostas
              </h3>
              <button 
                onClick={() => setShowBettingModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto flex-grow">
              <UserBettingDashboard user={user} isMaster={isMaster} />
            </div>
          </div>
        </div>
      )}

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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {adminCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={idx} className="group">
                  <Link to={card.to} className="block h-full">
                    <div className={`relative h-full overflow-hidden rounded-[2rem] bg-gradient-to-br ${card.gradient} text-white p-6 shadow-sm transition-all duration-300 hover:scale-[1.03] hover:shadow-lg flex flex-col justify-between border border-white/10 active:scale-95`}>
                      
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      
                      <div className="space-y-4 relative z-10 flex-grow">
                        <div className="bg-white/10 p-3 rounded-2xl w-12 h-12 flex items-center justify-center border border-white/25">
                          <IconComponent className="w-6 h-6 text-white" />
                        </div>
                        
                        <div className="space-y-1">
                          <h3 className="text-lg font-black uppercase tracking-tight italic">
                            {card.title}
                          </h3>
                          <p className="text-white/80 text-xs font-medium leading-relaxed">
                            {card.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="pt-6 mt-auto flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#F9D423] opacity-90 group-hover:opacity-100 group-hover:underline">
                        Configurar <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>

            {isMaster && masterCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <motion.div variants={itemVariants} key={`master-${idx}`} className="group">
                  <Link to={card.to} className="block h-full">
                    <div className={`relative h-full overflow-hidden rounded-[2rem] bg-gradient-to-br ${card.gradient} text-white p-6 shadow-sm transition-all duration-300 hover:scale-[1.03] hover:shadow-lg flex flex-col justify-between border border-white/10 active:scale-95`}>
                      
                      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      
                      <div className="space-y-4 relative z-10 flex-grow">
                        <div className="bg-white/10 p-3 rounded-2xl w-12 h-12 flex items-center justify-center border border-white/25">
                          <IconComponent className="w-6 h-6 text-primary-yellow" />
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black uppercase tracking-tight italic">
                              {card.title}
                            </h3>
                            <span className="bg-white/20 text-white text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                              Master
                            </span>
                          </div>
                          <p className="text-white/80 text-xs font-medium leading-relaxed">
                            {card.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="pt-6 mt-auto flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary-yellow group-hover:underline">
                        Configurar Master <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>→</motion.span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
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

      </div>
    </div>
  );
}
