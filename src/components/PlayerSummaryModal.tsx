import React, { useState } from 'react';
import { Player, Match, ScoringRules } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Trophy, ChevronDown, ChevronUp, Star, Target, HandHelping, Shield, TrendingUp, Info } from 'lucide-react';
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!scoringRules) return null;

  const playerMatches = matches.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id));
  
  let totalGoals = 0;
  let totalAssists = 0;
  let totalVictories = 0;
  let totalMVPs = 0;
  
  const matchHistory = playerMatches.map(match => {
    const pointsResults = calculateMatchPoints(match, match.scoreA, match.scoreB, match.events || [], match.mvpId, [player], scoringRules);
    const pPointsResult = pointsResults.find(p => p.playerId === player.id);
    const mGoals = (match.events || []).filter(e => e.playerId === player.id && e.type === 'goal').length;
    const mAssists = (match.events || []).filter(e => e.playerId === player.id && e.type === 'assist').length;
    
    totalGoals += mGoals;
    totalAssists += mAssists;
    
    const isTeamA = match.teamA.includes(player.id);
    const didWin = (isTeamA && match.scoreA > match.scoreB) || (!isTeamA && match.scoreB > match.scoreA);
    if (didWin) totalVictories += 1;
    if (match.mvpId === player.id) totalMVPs += 1;
    
    return { 
      match, 
      points: pPointsResult?.points || 0, 
      goals: mGoals, 
      assists: mAssists,
      breakdown: pPointsResult?.breakdown 
    };
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
              {matchHistory.map((item) => {
                const isExpanded = expandedId === item.match.id;
                
                return (
                  <div key={item.match.id} className="overflow-hidden">
                    <button 
                      onClick={() => setExpandedId(isExpanded ? null : item.match.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl text-xs border transition-all ${
                        isExpanded 
                          ? 'bg-primary-blue text-white border-primary-blue shadow-lg shadow-blue-100' 
                          : 'bg-gray-50 text-primary-gray border-gray-100 hover:border-primary-blue/20'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`font-bold ${isExpanded ? 'text-white/60' : 'text-gray-400'}`}>
                          {format(new Date(item.match.date + 'T00:00:00'), 'dd/MM')}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-black uppercase italic tracking-tight truncate max-w-[100px]">
                            {item.goals}G • {item.assists}A
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className={`font-black ${isExpanded ? 'text-white' : 'text-primary-blue'}`}>
                          {item.points > 0 ? `+${item.points}` : item.points} pts
                        </span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && item.breakdown && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-2"
                        >
                          <div className="bg-white border-x border-b border-gray-100 rounded-b-2xl p-4 space-y-3 shadow-inner">
                            <div className="grid grid-cols-2 gap-2">
                              {item.breakdown.result !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <Trophy size={12} className="text-yellow-500" />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Resultado</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.result}</span>
                                </div>
                              )}
                              {item.breakdown.goals !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <SoccerBall className="w-3 h-3 text-primary-blue" />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Gols ({item.breakdown.goalsCount})</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.goals}</span>
                                </div>
                              )}
                              {item.breakdown.assists !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <SoccerCleat className="w-3 h-3 text-primary-blue" />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Assists ({item.breakdown.assistsCount})</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.assists}</span>
                                </div>
                              )}
                              {item.breakdown.cleanSheet !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <Shield size={12} className="text-cyan-500" />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Clean Sheet</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.cleanSheet}</span>
                                </div>
                              )}
                              {item.breakdown.goalkeeperBonus !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <Target size={12} className="text-orange-500" />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Bônus Goleiro</span>
                                  </div>
                                  <span className="text-[10px] font-black text-primary-blue">+{item.breakdown.goalkeeperBonus}</span>
                                </div>
                              )}
                              {item.breakdown.goalDifference !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                  <div className="flex items-center gap-2">
                                    <TrendingUp size={12} className={item.breakdown.goalDifference > 0 ? "text-green-500" : "text-red-500"} />
                                    <span className="text-[10px] font-bold uppercase text-gray-400">Saldo</span>
                                  </div>
                                  <span className={`text-[10px] font-black ${item.breakdown.goalDifference > 0 ? "text-primary-blue" : "text-red-500"}`}>
                                    {item.breakdown.goalDifference > 0 ? `+${item.breakdown.goalDifference}` : item.breakdown.goalDifference}
                                  </span>
                                </div>
                              )}
                              {item.breakdown.mvp !== 0 && (
                                <div className="flex items-center justify-between p-2 bg-purple-50 rounded-xl border border-purple-100">
                                  <div className="flex items-center gap-2">
                                    <Star size={12} className="text-purple-500" />
                                    <span className="text-[10px] font-bold uppercase text-purple-400 tracking-tighter">Bônus MVP</span>
                                  </div>
                                  <span className="text-[10px] font-black text-purple-600">+{item.breakdown.mvp}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
