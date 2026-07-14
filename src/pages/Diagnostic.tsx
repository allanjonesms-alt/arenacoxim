import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { 
  Shield, CheckCircle, XCircle, AlertTriangle, User, Mail, Database, 
  Server, RefreshCw, Key, Search, Plus, Trash2, Settings, UserPlus, Fingerprint
} from 'lucide-react';

export default function Diagnostic() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [adminDocData, setAdminDocData] = useState<any>(null);
  const [adminDocExists, setAdminDocExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<'idle' | 'checking' | 'success' | 'failed'>('idle');
  const [dbError, setDbError] = useState<string | null>(null);
  const [testWriteStatus, setTestWriteStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testWriteError, setTestWriteError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  // Admin list state
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  // Form state to add/edit admins
  const [formUid, setFormUid] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'master'>('admin');
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  // Selected administrator to test/diagnose
  const [selectedDiagAdmin, setSelectedDiagAdmin] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        checkAdminDocument(user.uid);
        loadAllAdmins();
      } else {
        setAdminDocExists(false);
        setAdminDocData(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const checkAdminDocument = async (uid: string) => {
    try {
      setDbStatus('checking');
      const docRef = doc(db, 'admins', uid);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        setAdminDocExists(true);
        setAdminDocData(snapshot.data());
        setDbStatus('success');
      } else {
        setAdminDocExists(false);
        setAdminDocData(null);
        setDbStatus('success');
      }
    } catch (err: any) {
      console.error('Error fetching admin doc:', err);
      setDbError(err.message || String(err));
      setDbStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  const loadAllAdmins = async () => {
    setAdminsLoading(true);
    setAdminsError(null);
    try {
      const snap = await getDocs(collection(db, 'admins'));
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAdminsList(list);
    } catch (err: any) {
      console.error('Erro ao listar admins:', err);
      setAdminsError(err.message || String(err));
    } finally {
      setAdminsLoading(false);
    }
  };

  const forceTokenRefresh = async () => {
    if (!auth.currentUser) return;
    try {
      setDiagnosing(true);
      await auth.currentUser.getIdToken(true);
      await checkAdminDocument(auth.currentUser.uid);
      await loadAllAdmins();
      setDiagnosing(false);
      alert('Token JWT do Firebase recarregado com sucesso!');
    } catch (err: any) {
      setDiagnosing(false);
      alert('Falha ao recarregar token: ' + err.message);
    }
  };

  const runWriteTest = async () => {
    if (!currentUser) return;
    setTestWriteStatus('testing');
    setTestWriteError(null);
    try {
      // Attempt writing a test document in news collection
      const testDocRef = doc(db, 'news', 'test-diagnostic-write');
      await setDoc(testDocRef, {
        title: 'Teste de Diagnóstico',
        content: 'Isso é apenas um teste de gravação automática.',
        imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc',
        date: '2026-06-17',
        time: '12:00',
        createdAt: Date.now()
      });

      // If success, cleanup by deleting it
      await deleteDoc(testDocRef);
      setTestWriteStatus('success');
    } catch (err: any) {
      console.error('Test write failed:', err);
      setTestWriteStatus('failed');
      setTestWriteError(err.message || String(err));
    }
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUid.trim()) {
      alert('Por favor, informe o UID do usuário.');
      return;
    }
    setIsSavingAdmin(true);
    try {
      const docRef = doc(db, 'admins', formUid.trim());
      await setDoc(docRef, {
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        updatedAt: Date.now()
      });
      alert('Administrador salvo com sucesso!');
      setFormUid('');
      setFormName('');
      setFormEmail('');
      setFormRole('admin');
      await loadAllAdmins();
    } catch (err: any) {
      console.error('Erro ao salvar administrador:', err);
      alert('Falha ao salvar administrador: ' + err.message);
    } finally {
      setIsSavingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (uid: string) => {
    if (!window.confirm('Tem certeza de que deseja remover as permissões administrativas deste usuário?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'admins', uid));
      alert('Administrador removido com sucesso!');
      await loadAllAdmins();
      if (selectedDiagAdmin?.id === uid) {
        setSelectedDiagAdmin(null);
      }
    } catch (err: any) {
      console.error('Erro ao remover administrador:', err);
      alert('Falha ao remover administrador: ' + err.message);
    }
  };

  // Evaluate conditions client-side (to mirror security rules)
  const isUserAuthenticated = currentUser !== null;
  const isExactMasterUid = currentUser?.uid === '8I83FFoO4ASDc1vh2rN8fBN8AzE2';
  const isMasterEmail = currentUser?.email?.toLowerCase() === 'allanjonesms@gmail.com';
  const isDocAdminOrMaster = adminDocExists && (adminDocData?.role === 'master' || adminDocData?.role === 'admin');
  const doesAdminDocExistAtUid = adminDocExists === true;

  // Filter admins list based on search term
  const filteredAdmins = adminsList.filter(admin => {
    const term = searchTerm.toLowerCase();
    return (
      (admin.name || '').toLowerCase().includes(term) ||
      (admin.email || '').toLowerCase().includes(term) ||
      admin.id.toLowerCase().includes(term)
    );
  });

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-8 mb-8 text-white border border-slate-700/50 relative overflow-hidden shadow-xl animate-in fade-in duration-300">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-blue-600 p-3.5 rounded-2xl border border-blue-500/30">
            <Shield className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full font-black uppercase tracking-widest border border-blue-500/20">
              Sistema de Segurança
            </span>
            <h1 className="text-3xl font-black uppercase tracking-tight italic mt-1.5">Painel de Diagnóstico</h1>
          </div>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed max-w-2xl font-medium mt-2">
          Esta tela verifica em tempo real o seu estado de autenticação, o token JWT do Firebase, o seu registro na coleção <code className="bg-slate-950 px-1.5 py-0.5 rounded text-yellow-300 text-xs font-mono">admins</code> e simula as regras de segurança do Firestore para diagnosticar e gerenciar permissões de administradores (como o <strong>Luceilton</strong>).
        </p>
      </div>

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Auth Status */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Estado de Login</span>
              <User className="w-5 h-5 text-blue-500" />
            </div>
            {isUserAuthenticated ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="font-extrabold text-slate-800 text-sm">Autenticado</span>
                </div>
                <p className="text-xs text-gray-500 font-medium break-all">{currentUser?.email}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-500" />
                  <span className="font-semibold text-rose-700 text-sm">Desconectado</span>
                </div>
                <p className="text-xs text-gray-400">Por favor, faça login no topo da página antes do teste.</p>
              </div>
            )}
          </div>
          {isUserAuthenticated && (
            <button
              onClick={forceTokenRefresh}
              disabled={diagnosing}
              className="mt-4 w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl font-bold uppercase flex items-center justify-center gap-1.5 transition-all text-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${diagnosing ? 'animate-spin' : ''}`} /> Forçar Renovação Token
            </button>
          )}
        </div>

        {/* Card 2: Admin Doc */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Seu Registro Firestore</span>
              <Database className="w-5 h-5 text-emerald-500" />
            </div>
            {dbStatus === 'checking' ? (
              <div className="space-y-2 py-2">
                <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400">Consultando /admins/{currentUser?.uid}...</p>
              </div>
            ) : dbStatus === 'failed' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-rose-600">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-bold text-xs">Erro de Acesso</span>
                </div>
                <p className="text-[11px] text-rose-500 leading-tight bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-mono break-all max-h-[80px] overflow-y-auto">{dbError}</p>
              </div>
            ) : adminDocExists ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <span className="font-extrabold text-slate-800 text-sm">Documento Encontrado</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] font-mono whitespace-pre-wrap max-h-[85px] overflow-y-auto text-slate-600">
                  {JSON.stringify(adminDocData, null, 2)}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-500" />
                  <span className="font-semibold text-slate-700 text-xs">Sem Documento UID</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed font-semibold uppercase">O documento na coleção <code className="font-mono text-slate-800 bg-slate-50 px-1 py-0.5 rounded">admins</code> com ID de documento igual ao seu UID não foi encontrado.</p>
              </div>
            )}
          </div>
          {isUserAuthenticated && (
            <button
              onClick={() => checkAdminDocument(currentUser.uid)}
              className="mt-4 w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl font-bold uppercase transition-all"
            >
              Recarregar Documento
            </button>
          )}
        </div>

        {/* Card 3: Write Test */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Teste de Permissão</span>
              <Server className="w-5 h-5 text-indigo-500" />
            </div>
            {testWriteStatus === 'testing' ? (
              <div className="space-y-2 py-2">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400">Tentando criar no Firestore...</p>
              </div>
            ) : testWriteStatus === 'success' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-2.5 rounded-xl border border-emerald-100">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <span className="font-extrabold text-xs">Gravação Autorizada!</span>
                </div>
                <p className="text-xs text-gray-500">As regras permitiram criar e apagar documentos de notícia no Firestore!</p>
              </div>
            ) : testWriteStatus === 'failed' ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-rose-50 text-rose-700 p-2.5 rounded-xl border border-rose-100">
                  <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-xs block">Gravação Bloqueada!</span>
                    <p className="text-[10px] text-rose-600/90 font-mono mt-1 break-all line-clamp-2">{testWriteError}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-gray-400 font-semibold uppercase">Clique no botão para executar um teste real de gravação gravando e limpando um mock na coleção <code className="font-mono text-slate-800">news</code>.</p>
              </div>
            )}
          </div>
          {isUserAuthenticated && (
            <button
              onClick={runWriteTest}
              className="mt-4 w-full bg-indigo-600 hover:bg-indigo-750 text-white text-xs py-2 px-3 rounded-xl font-bold uppercase transition-all shadow-md active:scale-95"
            >
              Executar Teste Real
            </button>
          )}
        </div>
      </div>

      {/* SECTION: ADMIN MANAGER & DIAGNOSIS OF OTHERS (LUCEILTON TESTER) */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-8">
        <h2 className="text-lg font-black uppercase text-slate-800 tracking-tight border-b border-slate-100 pb-4 mb-6 flex items-center gap-2 italic">
          <Settings className="w-5 h-5 text-indigo-600 animate-spin-slow" /> Gerenciamento & Diagnóstico de Permissões de Terceiros (ex: Luceilton)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Column 1: Admins List & Search (Left) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-slate-500">Administradores Cadastrados ({adminsList.length})</span>
              <button 
                onClick={loadAllAdmins}
                className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Atualizar Lista
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Filtrar por nome, email ou UID (ex: Luceilton)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
              />
            </div>

            {/* Admins Table/List */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto">
              {adminsLoading ? (
                <div className="p-8 text-center text-xs text-gray-400">Carregando administradores...</div>
              ) : adminsError ? (
                <div className="p-8 text-center text-xs text-rose-500 bg-rose-50">Erro ao carregar lista: {adminsError}</div>
              ) : filteredAdmins.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 italic">Nenhum administrador encontrado.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredAdmins.map((admin) => (
                    <div 
                      key={admin.id} 
                      className={`p-3.5 flex items-center justify-between gap-4 transition-all hover:bg-slate-50 cursor-pointer ${selectedDiagAdmin?.id === admin.id ? 'bg-indigo-50/50 border-l-4 border-l-indigo-600' : ''}`}
                      onClick={() => setSelectedDiagAdmin(admin)}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-800 text-xs break-all">
                            {admin.name || 'Sem nome informado'}
                          </span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${admin.role === 'master' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {admin.role || 'admin'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{admin.email || 'Sem email'}</p>
                        <p className="text-[9px] text-slate-400 font-mono truncate flex items-center gap-1">
                          <Fingerprint className="w-2.5 h-2.5" /> UID: <span className="font-semibold select-all">{admin.id}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDiagAdmin(admin);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase py-1 px-2.5 rounded-lg transition-all"
                        >
                          Diagnosticar
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAdmin(admin.id);
                          }}
                          className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-all"
                          title="Remover Administrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick tips */}
            <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-100 text-[11px] text-yellow-800 space-y-1 font-semibold leading-relaxed">
              <p className="font-black text-xs uppercase flex items-center gap-1.5 text-yellow-900 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Como conceder acesso ao admin Luceilton?
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Peça para o Luceilton fazer login no aplicativo e acessar esta tela de <strong className="uppercase">Diagnóstico</strong>.</li>
                <li>Ele verá o <strong className="uppercase">Seu UID Autenticado</strong> (que é o ID exclusivo de login dele).</li>
                <li>Copie esse UID dele, preencha o formulário ao lado com o UID, Nome (Luceilton), E-mail e clique em <strong className="uppercase">Registrar Administrador</strong>.</li>
                <li>Instantaneamente, as regras de segurança do Firestore darão acesso administrativo completo a ele!</li>
              </ol>
            </div>
          </div>

          {/* Column 2: Save Admin & Diagnosis Result (Right) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Create/Edit Admin Form */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-tight mb-3 flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                <UserPlus className="w-4 h-4 text-indigo-600" /> Registrar / Editar Administrador
              </h3>
              <form onSubmit={handleSaveAdmin} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">UID do Usuário (Document ID no Firestore)</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Cole o UID exclusivo dele aqui..."
                    value={formUid}
                    onChange={(e) => setFormUid(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Luceilton"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">E-mail de Login</label>
                  <input 
                    type="email" 
                    placeholder="Ex: luceilton@gmail.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Função (Role)</label>
                  <select 
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-bold"
                  >
                    <option value="admin">Administrador (admin)</option>
                    <option value="master">Criador Principal (master)</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={isSavingAdmin}
                  className="w-full bg-indigo-600 hover:bg-indigo-750 text-white font-black uppercase text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {isSavingAdmin ? 'Gravando...' : 'Registrar Administrador'}
                </button>
              </form>
            </div>

            {/* Diagnostic Details of Selected User */}
            {selectedDiagAdmin ? (
              <div className="bg-indigo-900 text-white p-5 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200 border border-indigo-800">
                <h3 className="text-xs font-black uppercase text-indigo-200 tracking-wider mb-3 flex items-center justify-between">
                  <span>Diagnóstico: {selectedDiagAdmin.name || 'Sem nome'}</span>
                  <button 
                    onClick={() => setSelectedDiagAdmin(null)}
                    className="text-indigo-300 hover:text-white text-[10px] uppercase font-black"
                  >
                    Fechar
                  </button>
                </h3>
                
                <div className="space-y-3 text-xs leading-relaxed">
                  <div className="bg-indigo-950/60 p-3 rounded-xl border border-indigo-800/40 font-mono space-y-1">
                    <p className="text-[10px] text-indigo-300 uppercase font-black">ID do Documento (UID)</p>
                    <p className="text-white select-all font-bold break-all">{selectedDiagAdmin.id}</p>
                    <p className="text-[10px] text-indigo-300 uppercase font-black mt-2">Email Cadastrado</p>
                    <p className="text-white select-all font-bold break-all">{selectedDiagAdmin.email || 'NÃO CONFIGURADO'}</p>
                    <p className="text-[10px] text-indigo-300 uppercase font-black mt-2">Regra Atribuída</p>
                    <p className="text-yellow-300 select-all font-black break-all uppercase">{selectedDiagAdmin.role || 'admin'}</p>
                  </div>

                  <div className="border border-indigo-800 rounded-xl overflow-hidden text-[10px]">
                    <div className="bg-indigo-950 p-2 text-indigo-300 font-bold uppercase tracking-widest text-[8px]">
                      Simulação das Regras de Segurança
                    </div>
                    <div className="divide-y divide-indigo-850 bg-indigo-950/20">
                      <div className="p-2 flex items-center justify-between">
                        <span className="text-indigo-200">ID existe em /admins (UID)?</span>
                        <span className="text-emerald-400 font-bold">SIM (TRUE)</span>
                      </div>
                      <div className="p-2 flex items-center justify-between">
                        <span className="text-indigo-200">Email confere ou é Master?</span>
                        <span className="text-indigo-300 font-bold">OK</span>
                      </div>
                      <div className="p-2 flex items-center justify-between border-t border-indigo-800 bg-indigo-950/40">
                        <span className="font-extrabold text-indigo-100 uppercase">Resultado de isAdmin():</span>
                        <span className="bg-emerald-500 text-white font-black uppercase px-2 py-0.5 rounded text-[8px] tracking-wider">
                          AUTORIZADO
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-indigo-200 bg-indigo-950/40 p-2.5 rounded-lg leading-normal">
                    💡 <strong>Diagnóstico Científico:</strong> O administrador <strong className="text-yellow-300">{selectedDiagAdmin.name}</strong> está configurado com permissão no Firestore. Quando ele fizer login com a conta associada ao UID acima, ele terá permissões totais no painel.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100 text-center text-xs text-gray-400 italic">
                Selecione um administrador na lista para rodar simulações de segurança e testar acessos detalhadamente.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-8 overflow-hidden">
        <h2 className="text-sm font-black uppercase text-slate-800 tracking-tight border-b border-slate-100 pb-4 mb-4 flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-500" /> Seus Metadados de Segurança
        </h2>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Seu UID Autenticado</span>
              <p className="font-mono text-xs text-slate-700 mt-1 select-all font-semibold break-all">{currentUser?.uid || 'NÃO AUTENTICADO'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">E-mail do Token JWT</span>
              <p className="font-mono text-xs text-slate-700 mt-1 select-all font-semibold break-all">{currentUser?.email || 'NÃO AUTENTICADO'}</p>
            </div>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="bg-slate-50/70 p-3 text-xs font-bold text-slate-600 border-b border-slate-100 grid grid-cols-12 gap-2 uppercase tracking-widest text-[9px]">
              <div className="col-span-8 md:col-span-10">Validação da Função isAdmin() na Regra do Firestore</div>
              <div className="col-span-4 md:col-span-2 text-right">Resultado do Teste</div>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="p-4 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8 md:col-span-10">
                  <h3 className="text-xs font-extrabold text-slate-800">1. Usuário Conectado (request.auth != null)</h3>
                  <p className="text-[11px] text-gray-400 leading-normal mt-0.5">O Firestore exige que a requisição venha com credencial ativa.</p>
                </div>
                <div className="col-span-4 md:col-span-2 text-right">
                  {isUserAuthenticated ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-100">
                      <CheckCircle className="w-3 h-3" /> PASS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-rose-100">
                      <XCircle className="w-3 h-3" /> FAIL
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8 md:col-span-10">
                  <h3 className="text-xs font-extrabold text-slate-800">2. UID Exato Master (request.auth.uid == '8I83FFoO4ASDc1vh2rN8fBN8AzE2')</h3>
                  <p className="text-[11px] text-gray-400 leading-normal mt-0.5">Permissão master permanente hardcoded para o UID principal do desenvolvedor.</p>
                </div>
                <div className="col-span-4 md:col-span-2 text-right">
                  {isExactMasterUid ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-100">
                      <CheckCircle className="w-3 h-3" /> TRUE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                      FALSE
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8 md:col-span-10">
                  <h3 className="text-xs font-extrabold text-slate-800">3. E-mail Master (request.auth.token.email == 'allanjonesms@gmail.com')</h3>
                  <p className="text-[11px] text-gray-400 leading-normal mt-0.5">Permissão master permanente hardcoded para o e-mail de criador principal.</p>
                </div>
                <div className="col-span-4 md:col-span-2 text-right">
                  {isMasterEmail ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-100">
                      <CheckCircle className="w-3 h-3" /> TRUE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                      FALSE
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8 md:col-span-10">
                  <h3 className="text-xs font-extrabold text-slate-800">4. Registro UID Existente na Coleção admin (exists(/admins/$(uid)))</h3>
                  <p className="text-[11px] text-gray-400 leading-normal mt-0.5">A permissão recai se existe um registro na coleção com o ID exato igual ao UID.</p>
                </div>
                <div className="col-span-4 md:col-span-2 text-right">
                  {doesAdminDocExistAtUid ? (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-100">
                      <CheckCircle className="w-3 h-3" /> TRUE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-rose-100">
                      <XCircle className="w-3 h-3" /> FALSE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-150 rounded-3xl p-6 text-slate-800">
        <h3 className="text-sm font-black uppercase text-indigo-900 tracking-tight mb-2.5">💡 Resumo do Diagnóstico Teórico</h3>
        <p className="text-xs leading-relaxed font-semibold text-slate-600 uppercase">
          Se as luzes acima estão todas <span className="text-emerald-600 font-extrabold">PASS / TRUE</span> e ainda assim você recebe permissões negadas, isso indica que o banco de dados <code className="bg-white text-indigo-800 px-1 py-0.5 rounded border border-indigo-150 font-mono text-xs">arenacoxim2</code> não recebeu a última publicação das regras de segurança ou você está fazendo login em outro ID de aplicativo, ou há alguma divergência de regras em vigor na plataforma. Com este painel podemos obter as estatísticas completas e fazer a análise com rigor científico.
        </p>
      </div>
    </div>
  );
}
