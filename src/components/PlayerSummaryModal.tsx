import { Player, Match, ScoringRules } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Trophy } from 'lucide-react';
import { SoccerBall, SoccerCleat } from './Icons';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlayerSummaryModalProps {
  player: Player;
  matches: Match[];
  scoringRules: ScoringRules | null;
  onClose: () => void;
}

export function PlayerSummaryModal({ player, matches, scoringRules, onClose }: PlayerSummaryModalProps) {
  if (!scoringRules) return null;

  const playerMatches = matches.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
  
  let totalGoals = 0;
  let totalAssists = 0;
  let totalVictories = 0;
  let totalMVPs = 0;
  
  const matchHistory = playerMatches.map(match => {
    const points = calculateMatchPoints(match, match.scoreA, match.scoreB, match.events || [], match.mvpId, [player], scoringRules);
    const pPoints = points.find(p => p.playerId === player.id);
    const mGoals = (match.events || []).filter(e => e.playerId === player.id && e.type === 'goal').length;
    const mAssists = (match.events || []).filter(e => e.playerId === player.id && e.type === 'assist').length;
    
    totalGoals += mGoals;
    totalAssists += mAssists;
    
    const isTeamA = match.teamA.includes(player.id);
    const didWin = (isTeamA && match.scoreA > match.scoreB) || (!isTeamA && match.scoreB > match.scoreA);
    if (didWin) totalVictories += 1;
    if (match.mvpId === player.id) totalMVPs += 1;
    
    return { match, points: pPoints?.points || 0, goals: mGoals, assists: mAssists };
  });

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative bg-app-card w-full max-w-lg rounded-3xl border border-gray-100 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center border-2 border-gray-100 p-0.5">
              {player.photoUrl ? <img src={player.photoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : <User className="text-gray-300" />}
            </div>
            <div>
              <h3 className="text-lg font-black uppercase italic tracking-tight text-primary-blue">{player.nickname || player.name}</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{player.stats.matches} Partidas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
              <div className="text-3xl font-black italic text-primary-gray">{totalGoals}</div>
              <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Gols</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
              <div className="text-3xl font-black italic text-primary-gray">{totalAssists}</div>
              <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Assistências</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
              <div className="text-3xl font-black italic text-primary-gray">{totalVictories}</div>
              <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Vitórias</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
              <div className="text-3xl font-black italic text-primary-gray">{totalMVPs}</div>
              <div className="text-[10px] uppercase font-black text-gray-400 tracking-widest">MVP</div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-black uppercase tracking-widest mb-4 text-primary-blue italic">Histórico de Atuações</h4>
            <div className="space-y-2">
              {matchHistory.map((item, i) => (
                <div key={item.match.id} className="flex justify-between p-4 bg-gray-50 rounded-2xl text-xs border border-gray-100 hover:border-primary-blue/20 transition-colors">
                  <span className="font-bold text-gray-400">{format(new Date(item.match.date + 'T00:00:00'), 'dd/MM')}</span>
                  <span className="text-primary-gray">{item.goals} Gols • {item.assists} Ass.</span>
                  <span className="font-black text-primary-blue">{item.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
