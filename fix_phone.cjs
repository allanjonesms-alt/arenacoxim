const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerSummaryModal.tsx', 'utf8');

const oldCode = `                    {(isLinkedPlayer || isAdminView) && (
                      <button
                        onClick={() => setIsEditingPhone(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Telefone"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}`;

const newCode = `                    <button
                        onClick={() => setIsEditingPhone(true)}
                        className="ml-1 p-1 bg-white/10 hover:bg-white/25 rounded-lg text-white hover:text-primary-yellow transition-all cursor-pointer flex items-center justify-center"
                        title="Editar Telefone"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                  </div>
                ))}`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('src/components/PlayerSummaryModal.tsx', code);
