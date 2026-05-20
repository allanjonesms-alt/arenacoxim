import React, { useState } from 'react';
import { Player, Match, ScoringRules } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Trophy, ChevronDown, ChevronUp, Star, Target, HandHelping, Shield, TrendingUp, Info } from 'lucide-react';
import { SoccerBall, SoccerCleat } from './Icons';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { calculateGrade } from '../utils/gradeUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import cardBg from '../assets/images/athlete_card_bg_1779303562880.png';

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

  const avgPoints = (player.stats.points || 0) / (player.stats.matches || 1);
  const playerGrade = calculateGrade(player.overallStats, avgPoints);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative bg-white w-full max-w-lg rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header with FIFA style card */}
        <div className="relative bg-primary-blue p-8 pb-12 overflow-hidden">
          {/* Abstract background shapes */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-yellow/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />
          
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-6">
              {/* FIFA Card Visualization */}
              <div className="relative group filter drop-shadow-md hover:drop-shadow-lg transition-all">
                <div 
                  className="w-28 h-36 md:w-32 md:h-44 relative overflow-hidden transition-transform duration-500 hover:scale-[1.05]"
                  style={{
                    backgroundImage: `url(${cardBg})`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                  }}
                >
                  {/* Overall & Position */}
                  <div className="absolute left-2 top-8 md:top-10 flex flex-col items-center select-none pl-1">
                    <span className="text-xl md:text-2xl font-black italic text-amber-950 leading-none">
                      {playerGrade.grade}
                    </span>
                    <span className="text-[7px] md:text-[8px] font-black uppercase text-amber-950 mt-1 bg-amber-950/15 px-1 py-0.5 rounded tracking-wider">
                      {player.position.slice(0, 3).toUpperCase()}
                    </span>
                  </div>

                  {/* Player Photo */}
                  <div className="absolute inset-x-0 bottom-2 flex justify-center items-end h-[68%] pr-1 pointer-events-none">
                    <div className="p-0.5 rounded-full border border-dashed border-amber-500/20 shadow-inner bg-amber-950/5">
                      {player.photoUrl ? (
                        <img 
                          src={player.photoUrl} 
                          alt="" 
                          referrerPolicy="no-referrer"
                          className="w-[3.5rem] h-[3.5rem] md:w-[4.25rem] md:h-[4.25rem] rounded-full object-cover shadow-sm" 
                        />
                      ) : (
                        <div className="w-[3.5rem] h-[3.5rem] md:w-[4.25rem] md:h-[4.25rem] rounded-full bg-amber-950/10 flex items-center justify-center">
                          <User size={20} className="text-amber-950/20" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Player Info */}
              <div className="text-white">
                <div className="inline-block bg-primary-yellow text-primary-blue text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 shadow-lg">
                  {player.position}
                </div>
                <h3 className="text-2xl md:text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">
                  {player.nickname || player.name}
                </h3>
                <div className="flex items-center gap-4 text-white/60">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Partidas</span>
                    <span className="text-lg font-black italic text-white">{player.stats.matches}</span>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={onClose} 
              className="absolute top-0 right-0 p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all text-white backdrop-blur-md active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto space-y-8 bg-white -mt-6 rounded-t-[2.5rem] relative z-20">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-3 md:gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalGoals}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Gols</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalAssists}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Assists</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-blue group-hover:scale-110 transition-transform">{totalVictories}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">Vitórias</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100 group hover:border-primary-blue/30 transition-all">
              <div className="text-2xl md:text-3xl font-black italic text-primary-yellow group-hover:scale-110 transition-transform">{totalMVPs}</div>
              <div className="text-[9px] uppercase font-black text-gray-400 tracking-widest mt-1">MVP</div>
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
