import { Calculator } from 'lucide-react';
import { ScoringRules } from '../types';

interface CalculationRulesProps {
  rules: ScoringRules;
}

export default function CalculationRules({ rules }: CalculationRulesProps) {
  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
      <div className="flex items-center gap-4 md:gap-6">
        <div className="bg-primary-blue/5 p-3 md:p-4 rounded-2xl">
          <Calculator className="w-8 h-8 md:w-10 md:h-10 text-primary-blue" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-black uppercase italic mb-1 text-primary-blue">Como funciona o cálculo?</h3>
          <p className="text-gray-400 text-xs md:text-sm leading-relaxed">
            As pontuações são aplicadas automaticamente ao finalizar uma partida seguindo o regulamento da Liga Society.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pt-6 border-t border-gray-100">
        <div className="space-y-4">
          <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
            1. Resultado e Participação
          </h4>
          <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
            <li><strong className="text-gray-600">Vitória:</strong> +{rules.win} pontos para todos do time.</li>
            <li><strong className="text-gray-600">Empate:</strong> +{rules.draw} pontos para todos.</li>
            <li><strong className="text-gray-600">Gol Marcado:</strong> +{rules.goal} pontos por gol.</li>
            <li><strong className="text-gray-600">Assistência:</strong> +{rules.assist} pontos por assistência.</li>
          </ul>

          <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
            2. Goleiros e Defesa
          </h4>
          <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
            <li><strong className="text-gray-600">Clean Sheet:</strong> +7 pontos para goleiros, zagueiros e laterais, reduzidos por cada gol tomado.</li>
            <li><strong className="text-gray-600">Bônus de Vitória:</strong> Se vencer, ganha ({rules.win} - gols sofridos).</li>
            <li><strong className="text-gray-600">Bônus Base:</strong> Começa com +{rules.win} pontos (mantido em caso de empate/derrota).</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
            3. Saldo de Gols
          </h4>
          <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
            <li><strong className="text-gray-600">Time Vencedor:</strong> Ganha pontos iguais ao saldo de gols.</li>
            <li><strong className="text-gray-600">Time Perdedor:</strong> Perde pontos iguais ao saldo negativo.</li>
          </ul>

          <h4 className="text-primary-blue font-black uppercase italic text-xs md:text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-yellow" />
            4. Craque da Partida
          </h4>
          <ul className="text-[11px] md:text-xs text-gray-400 space-y-2 list-none pl-3">
            <li><strong className="text-gray-600">Bônus MVP:</strong> +{rules.mvp} pontos para o melhor da partida.</li>
            <li><strong className="text-gray-600">Critério:</strong> Maior pontuação total na partida.</li>
            <li><strong className="text-gray-600">Desempate:</strong> Time vencedor &gt; Média temporada &gt; Menor overall.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
