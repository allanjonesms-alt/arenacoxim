import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy, getCountFromServer } from 'firebase/firestore';
import { Player, Match, AdminData, Admin } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { calculateGrade } from '../utils/gradeUtils';
import { Trophy, Users, Calendar, TrendingUp, ShieldCheck, User, ChevronRight, Plus, Settings, Loader2, Link2, X, Shirt } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { SoccerBall } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import Diagnostic from './Diagnostic';
import { OrphanedPlayerInfo } from '../utils/maintenanceUtils';

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

  // Reassociate Orphaned Matches state
  const [showReassociateModal, setShowReassociateModal] = useState(false);
  const [orphanedList, setOrphanedList] = useState<OrphanedPlayerInfo[]>([]);
  const [selectedOrphanId, setSelectedOrphanId] = useState<string>('');
  const [useCustomOldId, setUseCustomOldId] = useState(false);
  const [customOldIdInput, setCustomOldIdInput] = useState<string>('');
  const [allPlayersList, setAllPlayersList] = useState<Player[]>([]);
  const [selectedTargetPlayerId, setSelectedTargetPlayerId] = useState<string>('');
  const [isReassociating, setIsReassociating] = useState(false);
  const [reassociateSuccess, setReassociateSuccess] = useState<string | null>(null);
  const [reassociateError, setReassociateError] = useState<string | null>(null);

  const handleOpenReassociateModal = async () => {
    setIsReassociating(true);
    setShowReassociateModal(true);
    setReassociateSuccess(null);
    setReassociateError(null);
    try {
      const { getOrphanedPlayerIds } = await import('../utils/maintenanceUtils');
      const orphans = await getOrphanedPlayerIds();
      setOrphanedList(orphans);
      if (orphans.length > 0) {
        setSelectedOrphanId(orphans[0].id);
      }
      const pSnap = await getDocs(collection(db, 'players'));
      const pList = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setAllPlayersList(pList.sort((a, b) => a.name.localeCompare(b.name)));
      if (pList.length > 0) {
        setSelectedTargetPlayerId(pList[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar dados para reassociação:", err);
      setReassociateError("Erro ao carregar lista de atletas órfãos.");
    } finally {
      setIsReassociating(false);
    }
  };

  const handleConfirmReassociate = async () => {
    const effectiveOldId = useCustomOldId ? customOldIdInput.trim() : selectedOrphanId;
    if (!effectiveOldId || !selectedTargetPlayerId) {
      setReassociateError("Por favor, selecione ou digite o ID antigo e o novo atleta cadastrado.");
      return;
    }
    setIsReassociating(true);
    setReassociateSuccess(null);
    setReassociateError(null);
    try {
      const { reassociatePlayerIdInMatches } = await import('../utils/maintenanceUtils');
      const res = await reassociatePlayerIdInMatches(effectiveOldId, selectedTargetPlayerId);
      const targetP = allPlayersList.find(p => p.id === selectedTargetPlayerId);
      const targetName = targetP ? (targetP.nickname || targetP.name) : 'Atleta';
      
      if (res.updatedMatches === 0 && (res.updatedTournaments || 0) === 0) {
        setReassociateError(`Nenhuma partida encontrada contendo o ID antigo "${effectiveOldId}". Verifique se o ID informado está correto.`);
      } else {
        setReassociateSuccess(`Histórico reassociado com sucesso para ${targetName}! ${res.updatedMatches} partida(s) atualizada(s) e estatísticas recalculadas.`);
      }

      // Refresh orphans list
      const { getOrphanedPlayerIds } = await import('../utils/maintenanceUtils');
      const orphans = await getOrphanedPlayerIds();
      setOrphanedList(orphans);
      if (orphans.length > 0) {
        setSelectedOrphanId(orphans[0].id);
      } else {
        setSelectedOrphanId('');
      }
    } catch (err) {
      console.error("Erro ao reassociar:", err);
      setReassociateError("Erro ao reassociar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsReassociating(false);
    }
  };

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
            <Link to="/admin/cartola" className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 rounded-3xl border border-emerald-500 flex items-center justify-between shadow-md hover:shadow-lg transition-all group">
              <span className="font-black uppercase tracking-widest text-white">Cartola Arena</span>
              <Shirt className="text-amber-300 w-6 h-6" />
            </Link>
            <Link to="/admin/tournaments" className="bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 p-6 rounded-3xl border border-amber-400 flex items-center justify-between shadow-md hover:shadow-lg transition-all group">
              <span className="font-black uppercase tracking-widest text-slate-950">Gerenciar Torneios</span>
              <Trophy className="text-slate-950 w-6 h-6" />
            </Link>
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
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button 
                      onClick={() => setShowRecalcConfirm(true)}
                      className="flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100 py-3 px-8 rounded-2xl font-black uppercase tracking-widest hover:bg-red-100 transition-all shadow-sm text-xs"
                    >
                      Recalcular Tudo
                    </button>
                    <button 
                      onClick={handleOpenReassociateModal}
                      className="flex items-center justify-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 py-3 px-6 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-100 transition-all shadow-sm text-xs"
                    >
                      <Link2 className="w-4 h-4 text-amber-600" />
                      Reassociar Atleta Excluído
                    </button>
                  </div>
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

      {/* Reassociate Modal */}
      {showReassociateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary-blue" />
                <h3 className="text-base font-black uppercase italic text-slate-900 tracking-tight">
                  Reassociar Partidas de Atleta Excluído
                </h3>
              </div>
              <button
                onClick={() => setShowReassociateModal(false)}
                className="text-gray-400 hover:text-slate-900 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 font-medium leading-relaxed">
              Quando um atleta (como <strong>LUCAS da ACS</strong>) é excluído acidentalmente e você cadastra um novo perfil para ele, selecione abaixo o <strong>ID antigo órfão</strong> e o <strong>novo perfil cadastrado</strong> para transferir todo o histórico de partidas, gols e estatísticas, recalculando os pontos automaticamente.
            </p>

            {reassociateSuccess && (
              <div className="p-3.5 bg-green-50 border border-green-200 text-green-800 rounded-2xl text-xs font-bold leading-relaxed">
                {reassociateSuccess}
              </div>
            )}

            {reassociateError && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold leading-relaxed">
                {reassociateError}
              </div>
            )}

            {isReassociating ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 className="w-8 h-8 text-primary-blue animate-spin" />
                <p className="text-xs font-black uppercase text-gray-400">Varrendo partidas e vinculando dados...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">
                      {useCustomOldId ? "Digitar ID Antigo Manualmente:" : "ID Antigo Órfão Encontrado no Histórico:"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomOldId(!useCustomOldId)}
                      className="text-[10px] font-black uppercase text-primary-blue hover:underline"
                    >
                      {useCustomOldId ? "Ver Lista Órfã" : "Digitar ID Manualmente"}
                    </button>
                  </div>

                  {useCustomOldId ? (
                    <input
                      type="text"
                      placeholder="Cole ou digite o ID antigo do jogador (ex: player_12345)"
                      value={customOldIdInput}
                      onChange={e => setCustomOldIdInput(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 text-slate-900 rounded-2xl p-3 text-xs font-bold focus:outline-none focus:border-primary-blue"
                    />
                  ) : orphanedList.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 p-3 rounded-2xl space-y-2">
                      <p className="text-xs font-bold text-gray-500 italic">
                        Nenhum ID órfão detectado automaticamente.
                      </p>
                      <button
                        type="button"
                        onClick={() => setUseCustomOldId(true)}
                        className="text-xs font-bold text-primary-blue underline"
                      >
                        Clique aqui para digitar o ID / identificador antigo manualmente
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedOrphanId}
                      onChange={e => setSelectedOrphanId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 text-slate-900 rounded-2xl p-3 text-xs font-bold focus:outline-none focus:border-primary-blue"
                    >
                      {orphanedList.map(o => (
                        <option key={o.id} value={o.id}>
                          ID: {o.id} ({o.matchCount} partidas, {o.eventCount} gols/eventos) {o.sampleMatchDates.length > 0 ? `[${o.sampleMatchDates.join(', ')}]` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                    Novo Perfil Cadastrado (Para onde transferir o histórico):
                  </label>
                  <select
                    value={selectedTargetPlayerId}
                    onChange={e => setSelectedTargetPlayerId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 text-slate-900 rounded-2xl p-3 text-xs font-bold focus:outline-none focus:border-primary-blue"
                  >
                    {allPlayersList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.nickname ? `("${p.nickname}")` : ''} - {p.position}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowReassociateModal(false)}
                    className="px-4 py-2 text-xs font-black uppercase text-gray-400 hover:text-slate-900 font-bold"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={handleConfirmReassociate}
                    disabled={!(useCustomOldId ? customOldIdInput.trim() : selectedOrphanId) || !selectedTargetPlayerId}
                    className="bg-primary-blue text-white font-black text-xs uppercase tracking-wider px-6 py-2.5 rounded-2xl hover:bg-blue-800 disabled:opacity-50 transition-all shadow-md shadow-blue-200"
                  >
                    Vincular Partidas & Recalcular
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
