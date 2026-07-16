import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { UserBettingDashboard } from '../components/UserBettingDashboard';

interface ApostasUsuarioProps {
  user: any;
  isMaster?: boolean;
}

export default function ApostasUsuario({ user, isMaster }: ApostasUsuarioProps) {
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center space-y-4 animate-in fade-in duration-300">
        <TrendingUp className="w-12 h-12 text-primary-yellow mx-auto" />
        <h2 className="text-2xl font-black uppercase text-primary-blue italic">Apostas Esportivas</h2>
        <p className="text-gray-500 font-semibold max-w-md mx-auto">
          Faça login na plataforma com sua conta Google para acessar o painel de apostas e dar seus palpites nos confrontos.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-primary-blue text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-950 transition-all shadow-md"
        >
          Voltar para o Início
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-500 hover:text-gray-800 border border-gray-100"
            title="Voltar para a Página Inicial"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary-yellow" />
              Apostas Esportivas
            </h1>
            <p className="text-gray-400 text-xs font-semibold mt-1">
              Participe dos palpites da Arena Coxim, gerencie seu saldo e acompanhe seu histórico.
            </p>
          </div>
        </div>
      </div>

      {/* Main betting area */}
      <UserBettingDashboard user={user} isMaster={isMaster} />
    </div>
  );
}
