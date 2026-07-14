import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy, getCountFromServer } from 'firebase/firestore';
import { Player, Match, AdminData, Admin } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { calculateGrade } from '../utils/gradeUtils';
import { Trophy, Users, Calendar, TrendingUp, ShieldCheck, User, ChevronRight, Plus, Settings, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { SoccerBall } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import Diagnostic from './Diagnostic';

interface AdminPanelProps {
  adminData?: AdminData | null;
}

export default function AdminPanel({ adminData }: AdminPanelProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'diagnostico'>('dashboard');
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalMatches: 0,
    totalGoals: 0,
    activeAdmins: 0
  });
  const [recentPlayers, setRecentPlayers] = useState<Player[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ matches: number; players: number } | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    const fetchAdminStats = async () => {
      setLoading(true);
      try {
        let qPlayers = collection(db, 'players');
        let qMatches = collection(db, 'matches');
        let qAdmins = collection(db, 'admins');

        if (adminData && adminData.role !== 'master' && adminData.locationId) {
          qPlayers = query(collection(db, 'players'), where('locationId', '==', adminData.locationId)) as any;
          qMatches = query(collection(db, 'matches'), where('locationId', '==', adminData.locationId)) as any;
          qAdmins = query(collection(db, 'admins'), where('locationId', '==', adminData.locationId)) as any;
        }

        const [playerCount, matchCount, adminCount] = await Promise.all([
          getCountFromServer(qPlayers),
          getCountFromServer(qMatches),
          getCountFromServer(qAdmins)
        ]);

        // Recent data fetches (limited)
        let qRecentPlayers = query(collection(db, 'players'), limit(20));
        if (adminData && adminData.role !== 'master' && adminData.locationId) {
          qRecentPlayers = query(collection(db, 'players'), where('locationId', '==', adminData.locationId), limit(20));
        }

        let qRecentMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), orderBy('time', 'desc'), limit(5));
        if (adminData && adminData.role !== 'master' && adminData.locationId) {
          qRecentMatches = query(collection(db, 'matches'), where('locationId', '==', adminData.locationId), orderBy('date', 'desc'), orderBy('time', 'desc'), limit(5));
        }

        let playersSnap, matchesSnap;
        try {
          [playersSnap, matchesSnap] = await Promise.all([
             getDocs(qRecentPlayers),
             getDocs(qRecentMatches)
          ]);
        } catch (err: any) {
          if (err.message?.includes('index') || err.code === 'failed-precondition') {
             console.warn("Admin Panel query failed due to missing index. Retrying simple fetch.");
             let qFallbackPlayers = query(collection(db, 'players'), limit(20));
             let qFallbackMatches = query(collection(db, 'matches'), limit(5));
             
             if (adminData && adminData.role !== 'master' && adminData.locationId) {
               qFallbackPlayers = query(collection(db, 'players'), where('locationId', '==', adminData.locationId), limit(20));
               qFallbackMatches = query(collection(db, 'matches'), where('locationId', '==', adminData.locationId), limit(5));
             }
             
             [playersSnap, matchesSnap] = await Promise.all([
                getDocs(qFallbackPlayers),
                getDocs(qFallbackMatches)
             ]);
          } else {
             throw err;
          }
        }

        // Fallback for matches if orderBy returned empty but count > 0
        if (matchesSnap.empty && stats.totalMatches > 0) {
          let qFallback = query(collection(db, 'matches'), limit(5));
          if (adminData && adminData.role !== 'master' && adminData.locationId) {
            qFallback = query(collection(db, 'matches'), where('locationId', '==', adminData.locationId), limit(5));
          }
          matchesSnap = await getDocs(qFallback);
        }

        const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
        const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));

        setStats({
          totalPlayers: playerCount.data().count,
          totalMatches: matchCount.data().count,
          totalGoals: players.reduce((acc, p) => acc + (p.stats?.goals || 0), 0), // Note: totalGoals is still a bit hard without aggregation or full fetch
          activeAdmins: adminCount.data().count
        });

        setRecentPlayers(players.slice(0, 5));
        setRecentMatches(matches);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'admin-stats');
      } finally {
        setLoading(false);
      }
    };

    fetchAdminStats();
  }, [adminData]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary-yellow animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: 'Jogadores', value: stats.totalPlayers, icon: Users, color: 'text-blue-500' },
    { label: 'Partidas', value: stats.totalMatches, icon: Calendar, color: 'text-[#00ff00]' },
    { label: 'Total de Gols', value: stats.totalGoals, icon: SoccerBall, color: 'text-red-500' },
    { label: 'Administradores', value: stats.activeAdmins, icon: ShieldCheck, color: 'text-yellow-500' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-primary-blue">Painel Administrativo</h2>
          <p className="text-gray-500 text-sm font-medium">Visão geral do sistema e ferramentas de gestão.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 shadow-sm self-start sm:self-auto shrink-0">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'bg-primary-blue text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('diagnostico')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'diagnostico'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Diagnóstico
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={card.label} 
                className="bg-app-card p-6 rounded-3xl border border-gray-100 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group"
              >
                <div className={`p-3 rounded-2xl bg-gray-50 group-hover:scale-110 transition-transform ${card.color.includes('blue') ? 'text-primary-blue' : card.color.includes('00ff00') ? 'text-green-600' : card.color}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black italic leading-none text-primary-gray">{card.value}</div>
                  <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest mt-1">{card.label}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
            <Link to="/admin/locations" className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
              <span className="font-black uppercase tracking-widest text-primary-gray group-hover:text-primary-blue transition-colors">Gerenciar Locais</span>
              <Plus className="text-primary-blue w-6 h-6" />
            </Link>
            <Link to="/admin/players" className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
              <span className="font-black uppercase tracking-widest text-primary-gray group-hover:text-primary-blue transition-colors">Gerenciar Jogadores</span>
              <Plus className="text-primary-blue w-6 h-6" />
            </Link>
            <Link to="/admin/banners" className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
              <span className="font-black uppercase tracking-widest text-primary-gray group-hover:text-primary-blue transition-colors">Gerenciar Banners</span>
              <Plus className="text-primary-blue w-6 h-6" />
            </Link>
            {adminData?.role === 'master' && (
              <Link to="/admin/betting-settings" className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
                <span className="font-black uppercase tracking-widest text-primary-gray group-hover:text-primary-blue transition-colors">Config. Apostas</span>
                <Settings className="text-primary-blue w-6 h-6" />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Activity or Quick Actions */}
            <div className="bg-app-card rounded-3xl border border-gray-100 p-8 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest italic mb-6 flex items-center gap-2 text-primary-blue">
                <TrendingUp className="text-primary-yellow w-5 h-5" /> Jogadores Recentes
              </h3>
              <div className="space-y-3">
                {recentPlayers.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-4 font-medium italic">Nenhum jogador encontrado.</p>
                ) : (
                  recentPlayers.map(player => (
                    <div key={player.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-primary-blue/20 transition-all group">
                      <div className="flex items-center gap-3">
                        {player.photoUrl ? (
                          <img src={player.photoUrl} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-100">
                            <User size={18} className="text-gray-300" />
                          </div>
                        )}
                        <span className="text-sm font-bold text-primary-gray group-hover:text-primary-blue transition-colors">{player.name}</span>
                      </div>
                      <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${getPositionColor(player.position)}`}>
                        {getPositionAbbr(player.position)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-app-card rounded-3xl border border-gray-100 p-8 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest italic mb-6 flex items-center gap-2 text-primary-blue">
                <Calendar className="text-primary-yellow w-5 h-5" /> Partidas Recentes
              </h3>
              <div className="space-y-3">
                {recentMatches.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-4 font-medium italic">Nenhuma partida encontrada.</p>
                ) : (
                  recentMatches.map(match => (
                    <div key={match.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-primary-blue/20 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-black italic text-primary-blue tabular-nums">
                          {match.scoreA} <span className="text-[10px] font-black text-primary-yellow mx-1">X</span> {match.scoreB}
                        </div>
                        <span className="text-xs font-black text-gray-400 uppercase tracking-tighter">{format(new Date(match.date + 'T00:00:00'), 'dd MMM')}</span>
                      </div>
                      <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full ${
                        match.status === 'finished' ? 'bg-gray-200 text-gray-500' : 
                        match.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 'bg-primary-blue/10 text-primary-blue'
                      }`}>
                        {match.status === 'finished' ? 'Finalizada' : match.status === 'live' ? 'AO VIVO' : 'Agendada'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 p-10 flex flex-col justify-center text-center lg:col-span-2 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-blue/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-primary-blue/10 transition-all duration-700"></div>
              <Trophy className="w-16 h-16 text-primary-yellow mx-auto mb-6 drop-shadow-sm" />
              <h3 className="text-2xl font-black uppercase italic mb-2 text-primary-blue tracking-tighter">ARENA COXIM <span className="text-primary-yellow">PRO</span></h3>
              <p className="text-gray-500 text-sm mb-10 max-w-sm mx-auto font-medium">Controle total da melhor gestão de peladas da região. Alta performance e precisão estatística.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
                {(!isRecalculating && !recalcResult && !showRecalcConfirm) && (
                  <button 
                    onClick={() => setShowRecalcConfirm(true)}
                    className="flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100 py-3 px-8 rounded-2xl font-black uppercase tracking-widest hover:bg-red-100 transition-all shadow-sm"
                  >
                    Recalcular Tudo
                  </button>
                )}

                {showRecalcConfirm && (
                  <div className="flex flex-col items-center gap-4 p-6 bg-red-50 rounded-2xl border border-red-100 animate-in zoom-in-95 duration-200">
                    <p className="text-red-800 text-xs font-black uppercase italic">Deseja recalcular toda a base? Isso levará alguns segundos.</p>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setShowRecalcConfirm(false)}
                        className="bg-white px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-red-200 text-gray-500 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={async () => {
                          setShowRecalcConfirm(false);
                          setIsRecalculating(true);
                          try {
                            const { recalculateAllPlayerStats } = await import('../utils/maintenanceUtils');
                            const result = await recalculateAllPlayerStats();
                            setRecalcResult({ matches: result.matchesProcessed, players: result.playersUpdated });
                          } catch (error) {
                            console.error("Erro ao recalcular:", error);
                            alert("Erro ao recalcular: " + (error instanceof Error ? error.message : String(error)));
                          } finally {
                            setIsRecalculating(false);
                          }
                        }}
                        className="bg-red-600 text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-200"
                      >
                        Confirmar Recálculo
                      </button>
                    </div>
                  </div>
                )}

                {isRecalculating && (
                  <div className="flex flex-col items-center gap-3 p-6 bg-blue-50 rounded-2xl border border-blue-100 w-full max-w-sm mx-auto">
                    <Loader2 className="w-8 h-8 text-primary-blue animate-spin" />
                    <p className="text-primary-blue text-[10px] font-black uppercase tracking-widest">Processando banco de dados...</p>
                  </div>
                )}

                {recalcResult && (
                  <div className="flex flex-col items-center gap-3 p-6 bg-green-50 rounded-2xl border border-green-100 w-full max-w-sm mx-auto">
                    <p className="text-green-800 text-[10px] font-black uppercase tracking-widest">Sucesso!</p>
                    <p className="text-green-600 text-[9px] font-bold">{recalcResult.players} jogadores e {recalcResult.matches} partidas atualizadas.</p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="mt-2 bg-green-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-200"
                    >
                      Atualizar Página
                    </button>
                  </div>
                )}

                {adminData?.role === 'master' && !isRecalculating && !showRecalcConfirm && !recalcResult && (
                  <Link 
                    to="/admin/admins"
                    className="flex items-center justify-center gap-3 bg-primary-blue text-white py-4 px-10 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all group/btn shadow-xl shadow-blue-200"
                  >
                    <ShieldCheck className="w-5 h-5 text-primary-yellow" />
                    <span>Gerenciar Admins</span>
                    <ChevronRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                  </Link>
                )}
              </div>
              {adminData?.role !== 'master' && (
                <div className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-8 flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Acesso restrito: {adminData?.locationId ? 'Sua Arena' : 'Local não definido'}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <Diagnostic />
      )}
    </div>
  );
}
