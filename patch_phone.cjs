const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerSummaryModal.tsx', 'utf8');

const targetStr = `                {isEditingPhone ? (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[9px] text-primary-yellow font-black uppercase tracking-wider">Alterar Telefone:</span>`;

const replaceStr = `                {(isLinkedPlayer || isAdminView) && (
                  isEditingPhone ? (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[9px] text-primary-yellow font-black uppercase tracking-wider">Alterar Telefone:</span>`;

code = code.replace(targetStr, replaceStr);

const targetStr2 = `                    {(isLinkedPlayer || isAdminView) && (
                      <button
                        onClick={() => setIsEditingPhone(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Telefone"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10.5px] font-bold text-white/70">`;

const replaceStr2 = `                    <button
                        onClick={() => setIsEditingPhone(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Telefone"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-[10.5px] font-bold text-white/70">`;

code = code.replace(targetStr2, replaceStr2);
fs.writeFileSync('src/components/PlayerSummaryModal.tsx', code);
