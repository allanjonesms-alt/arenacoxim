import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Player, Match, Card, OddsEngineConfig, Team } from '../types';
import { getPlayerFinalOverall } from '../utils/playerUtils';
import { Activity, Shield } from 'lucide-react';
import { SoccerJersey } from './SoccerJersey';
import { handleFirestoreError, OperationType } from '../App';

export const calculateMatchOdds = (
  teamAIds: string[], 
  teamBIds: string[], 
  players: Player[], 
  cards: Card[], 
  oddsConfig: OddsEngineConfig | null
) => {
  const teamA = teamAIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const teamB = teamBIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

  if (teamA.length === 0 || teamB.length === 0) return null;

  const getTeamStrength = (team: Player[]) => {
    if (team.length === 0) return 0;
    let totalOverall = 0;
    let totalPointsAvg = 0;

    team.forEach(p => {
      totalOverall += getPlayerFinalOverall(p, cards);
      const matches = p.stats?.matches || 1;
      const pts = p.stats?.points || 0;
      totalPointsAvg += (pts / matches);
    });
    
    const avgOverall = totalOverall / team.length;
    const avgPoints = totalPointsAvg / team.length;
    
    const pointsModifier = 1 + ((avgPoints - 1.0) * 0.05); 
    return avgOverall * pointsModifier;
  };

  const avgA = getTeamStrength(teamA);
  const avgB = getTeamStrength(teamB);

  const totalAvg = avgA + avgB;
  const baseShareA = avgA / totalAvg;
  const baseShareB = avgB / totalAvg;

  const ampPower = oddsConfig?.matchWinner?.amplificationPower ?? 5;
  const amplifiedA = Math.pow(baseShareA, ampPower);
  const amplifiedB = Math.pow(baseShareB, ampPower);
  const amplifiedTotal = amplifiedA + amplifiedB;

  let shareA = amplifiedA / amplifiedTotal;
  let shareB = amplifiedB / amplifiedTotal;

  const diff = Math.abs(avgA - avgB);
  const drawBaseProb = oddsConfig?.matchWinner?.drawBaseProbability ?? 0.25;
  const drawDiffDenom = oddsConfig?.matchWinner?.drawDiffDenominator ?? 15;
  let drawProb = drawBaseProb * Math.exp(-diff / drawDiffDenom);

  let probA = shareA * (1 - drawProb);
  let probB = shareB * (1 - drawProb);

  const margin = oddsConfig?.matchWinner?.margin ?? 1.25;
      
  let oddA = 1 / (probA * margin);
  let oddDraw = 1 / (drawProb * margin);
  let oddB = 1 / (probB * margin);

  oddA = Math.max(1.01, oddA);
  oddDraw = Math.max(1.01, oddDraw);
  oddB = Math.max(1.01, oddB);

  return {
    oddA: oddA.toFixed(2),
    oddDraw: oddDraw.toFixed(2),
    oddB: oddB.toFixed(2)
  };
};

interface ScheduledMatchesOddsProps {
  teams: Team[];
  players?: Player[];
  cards?: Card[];
}

export function ScheduledMatchesOdds({ teams, players: playersProp, cards: cardsProp }: ScheduledMatchesOddsProps) {
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>(playersProp ? [] : []);
  const [players, setPlayers] = useState<Player[]>(playersProp || []);
  const [cards, setCards] = useState<Card[]>(cardsProp || []);
  const [oddsConfig, setOddsConfig] = useState<OddsEngineConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (playersProp && playersProp.length > 0) {
      setPlayers(playersProp);
    }
  }, [playersProp]);

  useEffect(() => {
    if (cardsProp && cardsProp.length > 0) {
      setCards(cardsProp);
    }
  }, [cardsProp]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        // Parallelized fetching of matches and config to eliminate sequential await waterfalls
        const [matchesSnap, configDoc] = await Promise.all([
          getDocs(query(collection(db, 'matches'), where('status', '==', 'scheduled'))),
          getDoc(doc(db, 'settings', 'oddsEngine'))
        ]);

        const fetchedMatches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match)).sort((a, b) => a.date.localeCompare(b.date));
        
        let fetchedConfig = null;
        if (configDoc.exists()) {
          fetchedConfig = configDoc.data() as OddsEngineConfig;
        }

        // Reuse props if present to save on queries and avoid redudant massive reads
        let fetchedPlayers = playersProp || [];
        let fetchedCards = cardsProp || [];

        const hasPlayersProp = !!playersProp;
        const hasCardsProp = !!cardsProp;

        if (hasPlayersProp && fetchedPlayers.length === 0) {
          // Wait for the parent snapshot to load to avoid double/triple waterfalls
          return;
        }
        if (hasCardsProp && fetchedCards.length === 0) {
          // Wait for the parent snapshot to load to avoid double/triple waterfalls
          return;
        }

        if (fetchedPlayers.length === 0 || fetchedCards.length === 0) {
          const [playersSnap, cardsSnap] = await Promise.all([
            getDocs(collection(db, 'players')),
            getDocs(collection(db, 'cards'))
          ]);
          fetchedPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
          fetchedCards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Card));
        }

        if (isMounted) {
          setScheduledMatches(fetchedMatches);
          setPlayers(fetchedPlayers);
          setCards(fetchedCards);
          setOddsConfig(fetchedConfig);
          setLoading(false);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'matches');
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => { isMounted = false; };
  }, [playersProp, cardsProp]);

  if (loading) return null;
  if (scheduledMatches.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-black uppercase tracking-widest italic text-primary-blue flex items-center gap-2">
        <Activity className="w-5 h-5 text-purple-500" /> Odds de Partidas Agendadas (1x2)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scheduledMatches.map(match => {
          const odds = calculateMatchOdds(match.teamA, match.teamB, players, cards, oddsConfig);
          if (!odds) return null;

          const teamA = teams.find(t => t.id === match.teamAId);
          const teamB = teams.find(t => t.id === match.teamBId);
          
          const dateObj = new Date(`${match.date}T${match.time || '00:00'}`);
          const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

          return (
            <div key={match.id} className="bg-green-600/70 text-white rounded-2xl p-4 border border-green-600/50 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                 <span className="text-xs font-black uppercase text-white bg-black/20 px-2 py-0.5 rounded-md">
                   {dateStr}
                 </span>
                 <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/20 text-white">
                   Agendado
                 </span>
              </div>
              
              <div className="flex items-center justify-between mt-2">
                 <div className="flex flex-col items-center gap-1 w-1/3">
                   <div className="w-6 h-6">
                     {teamA ? <SoccerJersey color={teamA.color} /> : <Shield className="w-6 h-6 text-white/80" />}
                   </div>
                   <span className="text-[10px] font-bold text-white uppercase text-center line-clamp-1 w-full drop-shadow-sm">{teamA?.name || 'Azul'}</span>
                 </div>
                 <div className="text-[10px] font-black text-white/60 italic">X</div>
                 <div className="flex flex-col items-center gap-1 w-1/3">
                   <div className="w-6 h-6">
                     {teamB ? <SoccerJersey color={teamB.color} /> : <Shield className="w-6 h-6 text-white/80" />}
                   </div>
                   <span className="text-[10px] font-bold text-white uppercase text-center line-clamp-1 w-full drop-shadow-sm">{teamB?.name || 'Amarelo'}</span>
                 </div>
              </div>

              <div className="flex gap-2 justify-between mt-2 pt-3 border-t border-slate-200/60">
                 <div className="flex flex-col flex-1 items-center bg-white rounded-lg py-1 border border-slate-100 shadow-sm">
                   <span className="text-[8px] font-black uppercase text-gray-400">Time A</span>
                   <span className="text-sm font-black text-primary-blue">{odds.oddA}</span>
                 </div>
                 <div className="flex flex-col flex-1 items-center bg-white rounded-lg py-1 border border-slate-100 shadow-sm">
                   <span className="text-[8px] font-black uppercase text-gray-400">Empate</span>
                   <span className="text-sm font-black text-gray-600">{odds.oddDraw}</span>
                 </div>
                 <div className="flex flex-col flex-1 items-center bg-white rounded-lg py-1 border border-slate-100 shadow-sm">
                   <span className="text-[8px] font-black uppercase text-gray-400">Time B</span>
                   <span className="text-sm font-black text-amber-600">{odds.oddB}</span>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
