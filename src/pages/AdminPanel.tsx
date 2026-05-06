import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Player, Match, AdminData, Admin } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { Trophy, Users, Calendar, TrendingUp, ShieldCheck, User, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { SoccerBall } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';

interface AdminPanelProps {
  adminData?: AdminData | null;
}

export default function AdminPanel({ adminData }: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalMatches: 0,
    totalGoals: 0,
    activeAdmins: 0
  });
  const [recentPlayers, setRecentPlayers] = useState<Player[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  useEffect(() => {
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      let players = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        players = players.filter(p => p.locationId === adminData.locationId);
      }

      setStats(prev => ({
        ...prev,
        totalPlayers: players.length,
        totalGoals: players.reduce((acc, p) => acc + (p.stats.goals || 0), 0)
      }));
      setRecentPlayers(players.slice(0, 5));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      let matches = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));

      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        matches = matches.filter(m => m.locationId === adminData.locationId);
      }

      setStats(prev => ({ ...prev, totalMatches: matches.length }));
      setRecentMatches(matches.slice(0, 5));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));

    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snap) => {
      let admins = snap.docs.map(d => ({ id: d.id, ...d.data() } as Admin));

      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        admins = admins.filter(a => a.locationId === adminData.locationId);
      }

      setStats(prev => ({ ...prev, activeAdmins: admins.length }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'admins'));

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubAdmins();
    };
  }, [adminData]);

  const cards = [
    { label: 'Jogadores', value: stats.totalPlayers, icon: Users, color: 'text-blue-500' },
    { label: 'Partidas', value: stats.totalMatches, icon: Calendar, color: 'text-[#00ff00]' },
    { label: 'Total de Gols', value: stats.totalGoals, icon: SoccerBall, color: 'text-red-500' },
    { label: 'Administradores', value: stats.activeAdmins, icon: ShieldCheck, color: 'text-yellow-500' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-black uppercase italic tracking-tight text-primary-blue">Painel Administrativo</h2>
        <p className="text-gray-500 text-sm font-medium">Visão geral do sistema e estatísticas rápidas.</p>
      </div>

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
            <button 
              onClick={async () => {
                const { recalculateAllPlayerStats } = await import('../utils/maintenanceUtils');
                if (confirm("Deseja realmente recalcular todas as estatísticas? Este processo revisará todo o histórico de partidas.")) {
                  await recalculateAllPlayerStats();
                  alert("Estatísticas recalculadas com sucesso!");
                }
              }}
              className="flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100 py-3 px-8 rounded-2xl font-black uppercase tracking-widest hover:bg-red-100 transition-all"
            >
              Recalcular Tudo
            </button>
            {adminData?.role === 'master' && (
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
    </div>
  );
}
