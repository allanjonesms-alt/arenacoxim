import React from 'react';
import { Player, Team } from '../types';
import { SoccerJersey } from './SoccerJersey';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SoccerPitchProps {
  teamA: string[];
  teamB: string[];
  goalkeeperAId?: string;
  goalkeeperBId?: string;
  teamAColor?: string;
  teamBColor?: string;
  players: Player[];
  matchDate?: string;
  matchTime?: string;
}

export const SoccerPitch: React.FC<SoccerPitchProps> = ({
  teamA,
  teamB,
  goalkeeperAId,
  goalkeeperBId,
  teamAColor = '#555',
  teamBColor = '#555',
  players,
  matchDate,
  matchTime
}) => {
  const tPlayersA = teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const tPlayersB = teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

  const gkA = tPlayersA.find(p => p.id === goalkeeperAId);
  const gkB = tPlayersB.find(p => p.id === goalkeeperBId);

  const othersA = tPlayersA.filter(p => p.id !== goalkeeperAId);
  const othersB = tPlayersB.filter(p => p.id !== goalkeeperBId);

  // Layout logic
  const row1A = othersA.slice(0, 3);
  const row2A = othersA.slice(3, 5);
  const row3A = othersA.slice(5, 6);

  const row1B = othersB.slice(0, 3);
  const row2B = othersB.slice(3, 5);
  const row3B = othersB.slice(5, 6);

  return (
    <div className="relative aspect-[3/4] w-full bg-[#2e7d32] rounded-[1.5rem] md:rounded-[2.5rem] border-[4px] md:border-8 border-white/30 overflow-visible shadow-2xl flex flex-col">
      {/* Grass Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[1.5rem] md:rounded-[2.5rem]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)'
      }} />
      
      {/* Field Lines */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 md:w-40 md:h-40 border-2 md:border-4 border-white/20 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-0 right-0 h-0.5 md:h-1 bg-white/20 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 md:w-64 h-12 md:h-24 border-b-2 md:border-b-4 border-x-2 md:border-x-4 border-white/20 pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 md:w-64 h-12 md:h-24 border-t-2 md:border-t-4 border-x-2 md:border-x-4 border-white/20 pointer-events-none" />

      {/* Goalkeepers */}
      {gkB && (
        <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-2xl">
          <SoccerJersey color="#111" size={window.innerWidth < 768 ? 36 : 48} />
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[6px] md:text-[9px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
            {(gkB.nickname || gkB.name.split(' ')[0]).toUpperCase()}
          </span>
        </div>
      )}
      {gkA && (
        <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-2xl">
          <SoccerJersey color="#111" size={window.innerWidth < 768 ? 36 : 48} />
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[6px] md:text-[9px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
            {(gkA.nickname || gkA.name.split(' ')[0]).toUpperCase()}
          </span>
        </div>
      )}

      {/* Match Info Overlay */}
      {matchDate && (
        <div className="absolute bottom-2 left-2 md:bottom-6 md:left-6 z-20 text-left">
          <div className="inline-block bg-white/10 backdrop-blur-md px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-2xl border border-white/20 shadow-xl">
            <p className="text-[6px] md:text-[10px] font-black text-white/80 uppercase tracking-widest leading-none">
              {format(new Date(matchDate + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })} {matchTime ? `• ${matchTime}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Top Team (B) */}
      <div className="relative flex-1 flex flex-col justify-start pt-12 md:pt-24 gap-3 md:gap-6 z-10">
        <div className="flex justify-center gap-4 md:gap-10 h-10 md:h-16">
          {row1B.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamBColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-6 md:gap-12 h-10 md:h-16">
          {row2B.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamBColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center h-10 md:h-16">
          {row3B.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamBColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Team (A) */}
      <div className="relative flex-1 flex flex-col-reverse justify-start pb-12 md:pb-24 gap-3 md:gap-6 z-10">
        <div className="flex justify-center gap-4 md:gap-10 h-10 md:h-16">
          {row1A.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamAColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-6 md:gap-12 h-10 md:h-16">
          {row2A.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamAColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center h-10 md:h-16">
          {row3A.map(p => (
            <div key={p.id} className="relative flex items-center justify-center w-10 h-10 md:w-16 md:h-16 transition-transform hover:scale-110 drop-shadow-xl">
              <SoccerJersey color={teamAColor} size={window.innerWidth < 768 ? 32 : 44} />
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[5px] md:text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-1 md:px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                {(p.nickname || p.name.split(' ')[0]).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
