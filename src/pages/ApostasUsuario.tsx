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
      {/* Back Button Only */}
      <div className="flex items-center">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-2xl transition-all border border-gray-100 shadow-sm font-black text-xs uppercase tracking-wider cursor-pointer animate-in fade-in slide-in-from-left-4 duration-200"
          title="Voltar para a Página Inicial"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
      </div>

      {/* Main betting area */}
      <UserBettingDashboard user={user} isMaster={isMaster} />
    </div>
  );
}
