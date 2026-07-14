import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDoc, runTransaction } from 'firebase/firestore';
import { AdminData } from '../types';
import { motion } from 'framer-motion';
import { Wallet, CheckCircle2, XCircle, Clock, Search, ArrowLeft, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface MasterBankProps {
  adminData?: AdminData | null;
}

export default function MasterBank({ adminData }: MasterBankProps) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isMaster = adminData?.role === 'master';

  useEffect(() => {
    if (!isMaster) {
      navigate('/dashboard');
      return;
    }

    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isMaster, navigate]);

  const handleApprove = async (transaction: any) => {
    if (window.confirm(`Aprovar depósito de R$ ${transaction.amount.toFixed(2)} para ${transaction.userName}?`)) {
      try {
        await runTransaction(db, async (t) => {
          const userRef = doc(db, 'users', transaction.userId);
          const userSnap = await t.get(userRef);
          
          if (!userSnap.exists()) {
            throw new Error("Usuário não encontrado!");
          }
          
          const currentBalance = userSnap.data().balance || 0;
          const newBalance = currentBalance + transaction.amount;
          
          t.update(userRef, { balance: newBalance });
          
          const txRef = doc(db, 'transactions', transaction.id);
          t.update(txRef, { 
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: adminData?.email
          });
        });
        alert('Depósito aprovado e saldo atualizado!');
      } catch (error) {
        console.error("Erro ao aprovar:", error);
        alert('Erro ao aprovar depósito. Tente novamente.');
      }
    }
  };

  const handleReject = async (transaction: any) => {
    if (window.confirm('Rejeitar este depósito?')) {
      try {
        await updateDoc(doc(db, 'transactions', transaction.id), {
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedBy: adminData?.email
        });
      } catch (error) {
        console.error("Erro ao rejeitar:", error);
      }
    }
  };

  if (!isMaster) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-yellow/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link to="/admin/simulador" className="inline-flex items-center gap-2 text-primary-yellow hover:text-yellow-400 font-bold text-sm uppercase tracking-widest mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar para Simulador
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
              <Wallet className="w-8 h-8 text-primary-yellow" />
              Banco Master
            </h1>
            <p className="text-gray-400 font-semibold max-w-xl text-sm">
              Gerencie solicitações de depósito e saques dos usuários.
            </p>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-800 mb-6 flex items-center gap-2">
          <History className="w-5 h-5 text-primary-blue" />
          Transações Pendentes
        </h2>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-gray-500 font-bold">Nenhuma transação no momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-blue-200 transition-colors">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                    {tx.type === 'deposit' ? (
                      <Wallet className="w-6 h-6 text-primary-blue" />
                    ) : (
                      <Wallet className="w-6 h-6 text-rose-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-black text-gray-800 uppercase">{tx.userName}</h4>
                    <p className="text-xs text-gray-500 font-semibold">{tx.userEmail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">
                        {tx.type === 'deposit' ? 'Depósito PIX' : 'Saque'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">
                        {new Date(tx.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-0.5">Valor</p>
                    <p className="font-black text-lg text-gray-800">
                      R$ {tx.amount.toFixed(2)}
                    </p>
                  </div>

                  {tx.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(tx)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl transition-colors shadow-sm"
                        title="Aprovar"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleReject(tx)}
                        className="bg-rose-500 hover:bg-rose-600 text-white p-2.5 rounded-xl transition-colors shadow-sm"
                        title="Rejeitar"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest ${
                      tx.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {tx.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
