import React from 'react';
import { Player, Card } from '../types';
import { SoccerJersey } from './SoccerJersey';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Share2, Loader2, User } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

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
  teamAName?: string;
  teamBName?: string;
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
  matchTime,
  teamAName,
  teamBName
}) => {
  const resolvedTeamBColor = teamBColor && teamBColor !== '#555' && teamBColor !== '#eee' && teamBColor !== 'transparente' ? teamBColor : '#2563eb';
  const resolvedTeamAColor = teamAColor && teamAColor !== '#555' && teamAColor !== '#eee' && teamAColor !== 'transparente' ? teamAColor : '#eab308';

  const pitchRef = React.useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = React.useState(false);
  const [localCards, setLocalCards] = React.useState<Card[]>([]);
  const [shareImageUrl, setShareImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const qCards = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qCards, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card));
      setLocalCards(list);
    }, (err) => {
      console.error("Error loading cards inside SoccerPitch:", err);
    });

    return () => unsubscribe();
  }, []);

  const resolvePlayerCard = (player: Player) => {
    let cardBg = '';
    let fontColor = '#a52a2a';
    let overall = player.overallValue || 75;

    if (localCards && localCards.length > 0) {
      let assignedCard = localCards.find(c => c.imageUrl === player.cardBgUrl) || localCards.find(c => c.isDefault);
      
      if (assignedCard && assignedCard.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (assignedCard.expirationDate < todayStr) {
          assignedCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
        }
      }

      const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);
      const rawOverallWithBonus = (player.overallValue || 75) + cardBonusValue;

      const silverCard = localCards.find(c => {
        const n = c.name?.toUpperCase() || '';
        return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
      });
      const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

      const resolvedCard = forceSilver ? silverCard! : assignedCard;
      cardBg = resolvedCard?.imageUrl || '';
      fontColor = resolvedCard?.fontColor || '#a52a2a';

      const resolvedIsArtilheiro = resolvedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard?.increaseOverall || 0);
      overall = (player.overallValue || 75) + resolvedBonus;
    }

    if (!cardBg) {
      const defaultCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
      cardBg = player.cardBgUrl || defaultCard?.imageUrl || '';
    }

    return { cardBg, fontColor, overall };
  };

  const tPlayersA = teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const tPlayersB = teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

  const gkA = tPlayersA.find(p => p.id === goalkeeperAId);
  const gkB = tPlayersB.find(p => p.id === goalkeeperBId);

  const othersA = tPlayersA.filter(p => p.id !== goalkeeperAId);
  const othersB = tPlayersB.filter(p => p.id !== goalkeeperBId);

  // Layout logic for horizontal orientation
  const getVerticalPositions = (count: number): string[] => {
    if (count <= 1) return ['50%'];
    if (count === 2) return ['30%', '70%'];
    if (count === 3) return ['20%', '50%', '80%'];
    if (count === 4) return ['15%', '38%', '62%', '85%'];
    return Array.from({ length: count }, (_, i) => `${15 + (i * 70) / (count - 1)}%`);
  };

  const row1A = othersA.slice(0, 3);
  const row2A = othersA.slice(3, 5);
  const row3A = othersA.slice(5, 7);

  const row1B = othersB.slice(0, 3);
  const row2B = othersB.slice(3, 5);
  const row3B = othersB.slice(5, 7);

  // Parse safety for Date
  let formattedDateStr = "";
  if (matchDate) {
    try {
      formattedDateStr = format(new Date(matchDate + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR });
    } catch {
      formattedDateStr = matchDate;
    }
  }

  const getProxyUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('data:') || !url.startsWith('http')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  // Render FUT-style card
  const renderPlayerSymbol = (player: Player, teamColor: string, isGoalkeeper: boolean, isTeamB: boolean) => {
    const { cardBg, fontColor, overall } = resolvePlayerCard(player);
    const proxiedCardBg = getProxyUrl(cardBg);
    const proxiedPhotoUrl = getProxyUrl(player.photoUrl);

    // Dynamic aesthetic glow: Blue for Team B, Yellow/Gold for Team A
    const glowColor = isTeamB ? 'rgba(37, 99, 235, 0.85)' : 'rgba(234, 179, 8, 0.9)';
    const shadowFilter = `drop-shadow(0 2px 3px rgba(0,0,0,0.45)) drop-shadow(0 0 5px ${glowColor})`;

    const playerName = (player.nickname || player.name.split(' ')[0]).toUpperCase();

    return (
      <div className="flex flex-col items-center select-none pointer-events-none">
        {/* FUT Card Figure */}
        <div 
          className="w-8 sm:w-10 md:w-12 aspect-[3/4] relative select-none pointer-events-none rounded-none overflow-hidden bg-transparent"
          style={{ filter: shadowFilter }}
        >
          {/* Card Background image using inline <img> to ensure crossOrigin and correct rendering in html2canvas */}
          {proxiedCardBg ? (
            <img 
              src={proxiedCardBg} 
              alt="" 
              crossOrigin="anonymous" 
              referrerPolicy="no-referrer" 
              className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none bg-transparent" 
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-slate-900/40 backdrop-blur-[1px] border border-white/10 rounded-lg z-0" />
          )}

          {/* Rating and Position on the left (FUT layout) */}
          <div 
            className="absolute left-[7%] top-[18%] flex flex-col items-center select-none z-10" 
            style={{ color: fontColor }}
          >
            <span className="text-[11px] sm:text-[14px] md:text-[17px] font-black italic leading-none tracking-tighter">
              {overall.toString().padStart(2, '0')}
            </span>
            <span className="text-[3.5px] sm:text-[4.5px] md:text-[5.5px] font-black uppercase mt-0 sm:mt-0.5 tracking-wider opacity-95">
              {(player.position || '').slice(0, 3).toUpperCase()}
            </span>
          </div>

          {/* Player Photo */}
          <div className="absolute right-[5%] top-[14%] w-[71.5%] aspect-square pointer-events-none z-20 overflow-hidden bg-transparent">
            {proxiedPhotoUrl ? (
              <img 
                src={proxiedPhotoUrl} 
                alt="" 
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="w-full h-full object-cover rounded-none bg-transparent" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-transparent">
                <div className="scale-[0.5] md:scale-[0.7] opacity-85">
                  <SoccerJersey color={isGoalkeeper ? "#111" : teamColor} size={20} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Player Name outside card figure */}
        <div className="mt-0.5 bg-black/75 backdrop-blur-md px-1 sm:px-1.5 py-0.5 rounded border border-white/20 shadow-md text-center max-w-[64px] sm:max-w-[80px] md:max-w-[96px]">
          <span className="block text-[6.5px] sm:text-[8px] md:text-[10px] font-black uppercase tracking-tighter text-white leading-none truncate whitespace-nowrap">
            {playerName}
          </span>
        </div>
      </div>
    );
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pitchRef.current) return;
    setIsSharing(true);

    let originalCssRulesGetter: (() => CSSRuleList) | undefined = undefined;

    try {
      // Temporary patch to prevent html2canvas from crashing on Tailwind CSS oklch/oklab color values
      originalCssRulesGetter = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules')?.get;
      
      if (originalCssRulesGetter) {
        const proxyRule = (rule: any): any => {
          const handler: ProxyHandler<any> = {
            get(target, prop) {
              if (prop === 'cssText') {
                let text = target.cssText;
                if (text && (text.includes('oklch') || text.includes('oklab'))) {
                  text = text
                    .replace(/oklch\([^)]+\)/gi, 'rgb(120, 120, 120)')
                    .replace(/oklab\([^)]+\)/gi, 'rgb(120, 120, 120)');
                }
                return text;
              }
              if (prop === 'cssRules') {
                try {
                  const rules = target.cssRules;
                  if (!rules) return rules;
                  const proxiedRules = [];
                  for (let i = 0; i < rules.length; i++) {
                    proxiedRules.push(proxyRule(rules[i]));
                  }
                  return {
                    length: proxiedRules.length,
                    item: (index: number) => proxiedRules[index] || null,
                    ...proxiedRules
                  };
                } catch {
                  return [];
                }
              }
              const val = target[prop];
              if (typeof val === 'function') {
                return val.bind(target);
              }
              return val;
            }
          };
          return new Proxy(rule, handler);
        };

        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get() {
            try {
              const rules = originalCssRulesGetter!.call(this);
              const proxiedRules = [];
              for (let i = 0; i < rules.length; i++) {
                proxiedRules.push(proxyRule(rules[i]));
              }
              return {
                length: proxiedRules.length,
                item: (index: number) => proxiedRules[index] || null,
                ...proxiedRules
              } as unknown as CSSRuleList;
            } catch (err) {
              return [] as unknown as CSSRuleList;
            }
          },
          configurable: true
        });
      }

      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(pitchRef.current, {
        useCORS: true,
        logging: false,
        backgroundColor: '#2e7d32', // green field color
        scale: 2, // High resolution Quality
      });

      // Restore styleSheet rules parse behavior right away
      if (originalCssRulesGetter) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get: originalCssRulesGetter,
          configurable: true
        });
        originalCssRulesGetter = undefined; // prevent restoring again in finally block
      }

      // Retrieve JPEG DataURL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      // Save block to trigger our beautiful fallback preview/download Modal
      setShareImageUrl(dataUrl);

      // Check if mobile device
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      if (isMobileDevice && navigator.share && navigator.canShare) {
        try {
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const file = new File([blob], `campo_${matchDate || 'escalacao'}.jpg`, { type: 'image/jpeg' });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Escalação do Campo',
              text: 'Confira a escalação do campo para o nosso jogo!',
            });
            setIsSharing(false);
            return;
          }
        } catch (shareErr) {
          console.error("Native sharing failed, using modal fallback:", shareErr);
        }
      }

      // Desktop Download action or Mobile Fallback
      const link = document.createElement('a');
      link.download = `campo_${matchDate || 'escalacao'}.jpg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      alert("Não foi possível gerar a imagem no momento.");
    } finally {
      setIsSharing(false);
      if (originalCssRulesGetter) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get: originalCssRulesGetter,
          configurable: true
        });
      }
    }
  };

  return (
    <>
      <div 
        ref={pitchRef}
        className="relative aspect-[16/9] w-full bg-[#2e7d32] rounded-2xl md:rounded-3xl border-4 md:border-8 border-white/30 overflow-hidden shadow-2xl"
      >
        {/* Share Button in the Top-Right Corner */}
        <button
          onClick={handleShare}
          disabled={isSharing}
          data-html2canvas-ignore="true"
          className="absolute top-2 right-2 md:top-3 md:right-3 z-50 p-1.5 md:p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/20 shadow-lg cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          title="Compartilhar escalação (JPG)"
        >
          {isSharing ? (
            <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin text-white" />
          ) : (
            <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
          )}
          <span className="hidden md:inline text-[10px] font-black uppercase tracking-wider text-white">Compartilhar</span>
        </button>

        {/* Grass Pattern (Horizontal Stripes) */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none rounded-2xl md:rounded-3xl" 
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(255,255,255,0.05) 30px, rgba(255,255,255,0.05) 60px)'
          }} 
        />

        {/* Watermark Shield Crests on the Grass */}
        {/* Team A Watermark (Left side) */}
        <div className="absolute top-1/2 left-[25%] -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center justify-center z-0 opacity-[0.14]">
          <svg className="w-16 h-16 md:w-28 md:h-28" viewBox="0 0 100 100" fill="none" style={{ color: resolvedTeamAColor }}>
            <path 
              d="M50 5 L85 20 C85 55, 75 75, 50 95 C25 75, 15 55, 15 20 Z" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              fill="currentColor" 
              fillOpacity="0.05"
            />
            <polygon points="50,28 53,36 62,36 55,41 57,49 50,44 43,49 45,41 38,36 47,38" fill="currentColor" fillOpacity="0.8"/>
          </svg>
          <span 
            className="block text-[9px] sm:text-[12px] md:text-[18px] font-black uppercase tracking-[0.2em] font-sans mt-1 text-center truncate max-w-[160px]"
            style={{ color: resolvedTeamAColor }}
          >
            {teamAName || 'TIME AMARELO'}
          </span>
        </div>

        {/* Team B Watermark (Right side) */}
        <div className="absolute top-1/2 right-[25%] translate-x-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center justify-center z-0 opacity-[0.14]">
          <svg className="w-16 h-16 md:w-28 md:h-28" viewBox="0 0 100 100" fill="none" style={{ color: resolvedTeamBColor }}>
            <path 
              d="M50 5 L85 20 C85 55, 75 75, 50 95 C25 75, 15 55, 15 20 Z" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              fill="currentColor" 
              fillOpacity="0.05"
            />
            <polygon points="50,28 53,36 62,36 55,41 57,49 50,44 43,49 45,41 38,36 47,38" fill="currentColor" fillOpacity="0.8"/>
          </svg>
          <span 
            className="block text-[9px] sm:text-[12px] md:text-[18px] font-black uppercase tracking-[0.2em] font-sans mt-1 text-center truncate max-w-[160px]"
            style={{ color: resolvedTeamBColor }}
          >
            {teamBName || 'TIME AZUL'}
          </span>
        </div>

        {/* Field Markings (Horizontal Field) */}
        {/* Center Line */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 md:w-1 bg-white/20 pointer-events-none" />
        {/* Center Circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 md:w-32 md:h-32 border-2 md:border-4 border-white/20 rounded-full pointer-events-none" />
        {/* Center Dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 md:w-2.5 md:h-2.5 bg-white/30 rounded-full pointer-events-none" />

        {/* Left Penalty Area (Team A Goal Box) */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[16%] h-[60%] border-r-2 md:border-r-4 border-y-2 md:border-y-4 border-white/20 pointer-events-none" />
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[6%] h-[32%] border-r-2 md:border-r-3 border-y-2 md:border-y-3 border-white/20 pointer-events-none" />

        {/* Right Penalty Area (Team B Goal Box) */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[16%] h-[60%] border-l-2 md:border-l-4 border-y-2 md:border-y-4 border-white/20 pointer-events-none" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[6%] h-[32%] border-l-2 md:border-l-3 border-y-2 md:border-y-3 border-white/20 pointer-events-none" />

        {/* Goalkeepers */}
        {gkA && (
          <div 
            className="absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-transform hover:scale-110 drop-shadow-2xl"
            style={{ left: '5%', top: '50%' }}
          >
            {renderPlayerSymbol(gkA, resolvedTeamAColor, true, false)}
          </div>
        )}
        {gkB && (
          <div 
            className="absolute -translate-x-1/2 -translate-y-1/2 z-30 transition-transform hover:scale-110 drop-shadow-2xl"
            style={{ left: '95%', top: '50%' }}
          >
            {renderPlayerSymbol(gkB, resolvedTeamBColor, true, true)}
          </div>
        )}

        {/* Team A Players (Left side, attacking right) */}
        {row1A.map((p, idx) => {
          const topPos = getVerticalPositions(row1A.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '17%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
            </div>
          );
        })}
        {row2A.map((p, idx) => {
          const topPos = getVerticalPositions(row2A.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '30%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
            </div>
          );
        })}
        {row3A.map((p, idx) => {
          const topPos = getVerticalPositions(row3A.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '42%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
            </div>
          );
        })}

        {/* Team B Players (Right side, attacking left) */}
        {row1B.map((p, idx) => {
          const topPos = getVerticalPositions(row1B.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '83%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
            </div>
          );
        })}
        {row2B.map((p, idx) => {
          const topPos = getVerticalPositions(row2B.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '70%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
            </div>
          );
        })}
        {row3B.map((p, idx) => {
          const topPos = getVerticalPositions(row3B.length)[idx];
          return (
            <div 
              key={p.id} 
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform hover:scale-110 drop-shadow-xl"
              style={{ left: '58%', top: topPos }}
            >
              {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
            </div>
          );
        })}

        {/* Match Info Overlay */}
        {formattedDateStr && (
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 z-20 text-left pointer-events-none">
            <div className="inline-block bg-black/30 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 shadow-md">
              <p className="text-[6px] sm:text-[8px] md:text-[9px] font-black text-white/90 uppercase tracking-widest leading-none">
                {formattedDateStr} {matchTime ? `• ${matchTime}` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Elegant Fallback Download Preview Modal */}
      {shareImageUrl && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-white/10 rounded-2xl p-5 md:p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-white"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/25 flex items-center justify-center text-emerald-400 mb-3 text-xl">
              ⚽
            </div>
            <h3 className="text-base md:text-lg font-black text-white mb-1.5 text-center uppercase tracking-wider">
              Imagem do Campo Gerada!
            </h3>
            <p className="text-xs text-slate-300 mb-5 text-center leading-relaxed">
              A escalação foi gerada com sucesso. Toque e segure na imagem abaixo para <strong>compartilhar ou salvar</strong>, ou clique no botão de download.
            </p>
            
            {/* Real Generated Image */}
            <div className="relative border-2 border-white/20 rounded-xl overflow-hidden aspect-[3/4] w-full max-h-[40vh] mb-5 shadow-lg bg-emerald-800">
              <img 
                src={shareImageUrl} 
                alt="Escalação gerada" 
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-col gap-2 w-full">
              <a 
                href={shareImageUrl} 
                download={`campo_${matchDate || 'escalacao'}.jpg`}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-3 px-4 rounded-xl text-center text-xs md:text-sm uppercase tracking-wider transition-all active:scale-95 shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none"
              >
                📥 Baixar Imagem (JPG)
              </a>

              <button 
                onClick={() => setShareImageUrl(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold py-2.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer border border-white/5 focus:outline-none"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

