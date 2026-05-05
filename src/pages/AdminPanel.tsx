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
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black uppercase italic tracking-tight">Painel Administrativo</h2>
        <p className="text-gray-500 text-sm">Visão geral do sistema e estatísticas rápidas.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={card.label} 
            className="bg-[#1a1a1a] p-6 rounded-2xl border border-white/5 flex items-center gap-4"
          >
            <div className={`p-3 rounded-xl bg-white/5 ${card.color}`}>
              <card.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-black italic leading-none">{card.value}</div>
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">{card.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity or Quick Actions */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-8">
          <h3 className="text-sm font-black uppercase tracking-widest italic mb-6 flex items-center gap-2">
            <TrendingUp className="text-[#00ff00] w-4 h-4" /> Jogadores Recentes
          </h3>
          <div className="space-y-4">
            {recentPlayers.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-4">Nenhum jogador encontrado.</p>
            ) : (
              recentPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-3">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                        <User size={16} className="text-gray-600" />
                      </div>
                    )}
                    <span className="text-sm font-bold">{player.name}</span>
                  </div>
                  <span className={`text-[10px] uppercase font-black ${getPositionColor(player.position)}`}>
                    {getPositionAbbr(player.position)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-8">
          <h3 className="text-sm font-black uppercase tracking-widest italic mb-6 flex items-center gap-2">
            <Calendar className="text-[#00ff00] w-4 h-4" /> Partidas Recentes
          </h3>
          <div className="space-y-4">
            {recentMatches.length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-4">Nenhuma partida encontrada.</p>
            ) : (
              recentMatches.map(match => (
                <div key={match.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-black italic text-[#00ff00]">
                      {match.scoreA} - {match.scoreB}
                    </div>
                    <span className="text-xs font-bold">{format(new Date(match.date + 'T00:00:00'), 'dd/MM')}</span>
                  </div>
                  <span className={`text-[10px] uppercase font-black ${
                    match.status === 'finished' ? 'text-gray-500' : 
                    match.status === 'live' ? 'text-[#00ff00] animate-pulse' : 'text-blue-500'
                  }`}>
                    {match.status === 'finished' ? 'Finalizada' : match.status === 'live' ? 'AO VIVO' : 'Agendada'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#111] rounded-2xl border border-white/5 p-8 flex flex-col justify-center text-center lg:col-span-2">
          <Trophy className="w-16 h-16 text-[#00ff00] mx-auto mb-4 animate-bounce" />
          <h3 className="text-xl font-black uppercase italic mb-2">ARENA COXIM Pro</h3>
          <p className="text-gray-500 text-sm mb-6">Você está no comando da melhor gestão de peladas da região.</p>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={async () => {
                const { recalculateAllPlayerStats } = await import('../utils/maintenanceUtils');
                alert("Iniciando recalculo... isso pode demorar um pouco.");
                await recalculateAllPlayerStats();
                alert("Recalculado com sucesso!");
              }}
              className="flex items-center justify-center gap-2 bg-red-900 text-white py-3 px-6 rounded-xl font-black uppercase tracking-widest hover:bg-red-800 transition-all"
            >
              Recalcular Estatísticas Gerais
            </button>
            {adminData?.role === 'master' && (
              <>
                <Link 
                  to="/admin/admins"
                  className="flex items-center justify-center gap-2 bg-[#00ff00] text-black py-3 px-6 rounded-xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-all group"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Gerenciar Admins</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </>
            )}
            {adminData?.role !== 'master' && (
              <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-4">
                Acesso restrito ao seu local
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
