import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { MonthlyAward, Player, Card, Location } from '../types';
import { Trophy, Calendar, MapPin, Award, ArrowLeft, Star, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';

export default function PublicMonthlyAwards() {
  const [awards, setAwards] = useState<MonthlyAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Locations
    const unsubLocations = onSnapshot(collection(db, 'locations'), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'locations'));

    // 2. Fetch Awards ordered by creation date (newest first)
    const qAwards = query(collection(db, 'monthlyAwards'), orderBy('createdAt', 'desc'));
    const unsubAwards = onSnapshot(qAwards, (snap) => {
      setAwards(snap.docs.map(d => ({ id: d.id, ...d.data() } as MonthlyAward)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'monthlyAwards'));

    // 3. Fetch Players
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'players'));

    // 4. Fetch Cards
    const unsubCards = onSnapshot(collection(db, 'cards'), (snap) => {
      setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'cards'));

    return () => {
      unsubLocations();
      unsubAwards();
      unsubPlayers();
      unsubCards();
    };
  }, []);

  // Helper to get location name
  const getLocationName = (id: string) => {
    return locations.find(l => l.id === id)?.name || 'Arena Desconhecida';
  };

  // Helper to format month (e.g., "2026-07" -> "Julho de 2026")
  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthIndex = parseInt(month, 10) - 1;
    return `${months[monthIndex] || month} de ${year}`;
  };

  // Extract unique months from awards sorted in descending order (newest first)
  const uniqueMonths = Array.from(new Set(awards.map(a => a.month))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="space-y-1">
          <Link 
            to="/" 
            className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-650 hover:text-emerald-700 uppercase tracking-widest transition-all mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Início
          </Link>
          <h1 className="text-3xl font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2.5">
            <Trophy className="w-8 h-8 text-primary-yellow drop-shadow-sm" /> Melhores do Mês
          </h1>
          <p className="text-gray-400 text-xs font-semibold">Galeria de prêmios e destaques individuais das arenas.</p>
        </div>
      </div>

      {/* Main Awards List grouped by Month */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-blue"></div>
        </div>
      ) : awards.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <Award className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <h3 className="text-sm font-black text-gray-600 uppercase">Nenhum prêmio cadastrado</h3>
          <p className="text-[11px] text-gray-400 mt-1">Nenhum prêmio de melhor do mês foi adicionado ainda.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {uniqueMonths.map((month) => {
            const monthAwards = awards.filter(a => a.month === month);
            if (monthAwards.length === 0) return null;

            return (
              <div key={month} className="space-y-4">
                {/* Month Section Header */}
                <div className="flex items-center gap-3 border-b border-gray-100 pb-2">
                  <Calendar className="w-5 h-5 text-emerald-650" />
                  <h2 className="text-lg font-black uppercase text-primary-blue tracking-tight">
                    {formatMonth(month)}
                  </h2>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                    {monthAwards.length} {monthAwards.length === 1 ? 'Destaque' : 'Destaques'}
                  </span>
                </div>

                {/* Awards for this month */}
                <div className="grid grid-cols-1 gap-3">
                  {monthAwards.map((award, index) => {
                    const player = players.find(p => p.id === award.playerId);
                    const card = cards.find(c => c.id === award.cardId);
                    const categoryLabel = award.category;

                    // Short abbreviation for category inside layouts - changed Garçom to Assistente
                    const categoryAbbr = award.category === 'ARTILHEIRO DO MÊS' ? 'Artilheiro' : 
                                         award.category === 'ASSISTENTE DO MÊS' ? 'Assistente' :
                                         award.category === 'MELHOR GOLEIRO' ? 'Muralha' :
                                         award.category === 'MELHOR DEFENSOR' ? 'Defensor' : 'Lateral';

                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
                        key={award.id}
                        className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-4 hover:border-emerald-150 shadow-sm transition-all relative group overflow-hidden"
                      >
                        {/* Background glow on hover */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-yellow/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-primary-yellow/15 transition-all" />

                        {/* 60x80 pixels FUT Card Thumbnail / Miniature */}
                        <div 
                          className="w-[60px] h-[80px] flex-shrink-0 bg-gradient-to-b from-gray-50 to-gray-100 rounded-lg border border-gray-100 overflow-hidden flex items-center justify-center relative shadow-sm group-hover:shadow-md transition-all group-hover:scale-105"
                          style={{ width: '60px', height: '80px' }}
                        >
                          {card?.imageUrl ? (
                            <img 
                              src={card.imageUrl} 
                              alt="" 
                              className="w-full h-full object-contain drop-shadow-sm select-none"
                            />
                          ) : (
                            <Trophy className="w-5 h-5 text-gray-300" />
                          )}
                          {/* Subtle hover spark effect */}
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Sparkles className="w-3 h-3 text-primary-yellow animate-pulse" />
                          </div>
                        </div>

                        {/* Award and Player Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                          
                          {/* Top: Category */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-black text-primary-blue bg-primary-yellow/20 px-2 py-0.5 rounded-md uppercase tracking-wide">
                              {categoryLabel}
                            </span>
                          </div>

                          {/* Middle: Player Name */}
                          <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight truncate leading-none mb-1">
                            {player?.name || 'Jogador Removido'}
                            {player?.nickname && (
                              <span className="text-emerald-650 ml-1.5 text-xs font-black italic">
                                "{player.nickname}"
                              </span>
                            )}
                          </h3>

                          {/* Bottom: Location Metadata */}
                          <div className="flex items-center gap-1 text-[10px] font-bold text-gray-450 uppercase">
                            <MapPin className="w-3 h-3 text-emerald-650" />
                            <span>{getLocationName(award.locationId)}</span>
                            <span className="mx-1">•</span>
                            <span className="text-[9px] text-gray-400 font-semibold">{categoryAbbr} destacado</span>
                          </div>

                        </div>

                        {/* Trophy Accent on right (desktop and tablet screen only) */}
                        <div className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 group-hover:bg-primary-yellow group-hover:text-primary-blue transition-all">
                          <Star className="w-4 h-4 fill-current" />
                        </div>

                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
