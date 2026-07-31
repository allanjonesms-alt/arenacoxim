import { collection, query, where, getDocs, doc, runTransaction, writeBatch } from 'firebase/firestore';

/**
 * Checks if a user has bets in status 'pending_payment'.
 * If the user has sufficient balance now, it deducts the bet amounts
 * in chronological order and converts their status to 'pending' (approved & active).
 */
export async function processPendingPaymentBets(db: any, userId: string): Promise<number> {
  if (!userId) return 0;

  try {
    const betsRef = collection(db, 'bets');
    const q = query(
      betsRef,
      where('userId', '==', userId),
      where('status', '==', 'pending_payment')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const pendingBets: any[] = [];
    snapshot.forEach((d) => pendingBets.push({ id: d.id, ...d.data() }));

    // Sort by createdAt ascending
    pendingBets.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    let approvedCount = 0;

    await runTransaction(db, async (t) => {
      const userRef = doc(db, 'users', userId);
      const userSnap = await t.get(userRef);
      if (!userSnap.exists()) return;

      let currentBalance = Number(userSnap.data().balance) || 0;
      if (currentBalance <= 0) return;

      for (const bet of pendingBets) {
        const betAmount = Number(bet.amount) || 0;
        if (betAmount > 0 && currentBalance >= betAmount) {
          currentBalance -= betAmount;
          approvedCount++;

          const betRef = doc(db, 'bets', bet.id);
          t.update(betRef, {
            status: 'pending',
            approvedAt: new Date().toISOString()
          });
        } else {
          break; // Stop if balance cannot cover this bet
        }
      }

      if (approvedCount > 0) {
        t.update(userRef, { balance: currentBalance });
      }
    });

    return approvedCount;
  } catch (error) {
    console.error("Error processing pending payment bets:", error);
    return 0;
  }
}

/**
 * Automatically evaluates pending bets for a finished match based on final scores.
 * Sets `evaluatedResult: 'won' | 'lost'` and `evaluatedReason` so the Admin Master can approve payouts.
 */
export async function autoEvaluateMatchBets(db: any, matchId: string, scoreA: number, scoreB: number): Promise<number> {
  if (!matchId) return 0;

  try {
    const betsRef = collection(db, 'bets');
    const q = query(
      betsRef,
      where('matchId', '==', matchId),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const winner = scoreA > scoreB ? 'teamA' : scoreB > scoreA ? 'teamB' : 'draw';
    const totalGoals = scoreA + scoreB;
    const matchOutcomeStr = `Placar Final: ${scoreA} x ${scoreB} (${winner === 'teamA' ? 'Vitória Time Azul' : winner === 'teamB' ? 'Vitória Time Amarelo' : 'Empate'})`;

    let evaluatedCount = 0;
    const batch = writeBatch(db);

    snapshot.docs.forEach((d) => {
      const bet = d.data();
      let outcome: 'won' | 'lost' | null = null;
      let reason = matchOutcomeStr;

      if (bet.market === 'matchWinner') {
        const sel = String(bet.selection || '').toLowerCase();
        if (sel === 'teama' || sel === 'time a' || sel === 'azul' || sel === 'time azul') {
          outcome = winner === 'teamA' ? 'won' : 'lost';
        } else if (sel === 'teamb' || sel === 'time b' || sel === 'amarelo' || sel === 'time amarelo') {
          outcome = winner === 'teamB' ? 'won' : 'lost';
        } else if (sel === 'draw' || sel === 'empate') {
          outcome = winner === 'draw' ? 'won' : 'lost';
        }
      } else if (bet.market === 'matchGoals') {
        const sel = String(bet.selection || bet.selectedOutcome || '');
        const numMatch = sel.match(/(\d+[.,]?\d*)/);
        if (numMatch) {
          const line = parseFloat(numMatch[1].replace(',', '.'));
          if (sel.toLowerCase().includes('mais') || sel.toLowerCase().includes('over')) {
            outcome = totalGoals > line ? 'won' : 'lost';
            reason = `Total de Gols: ${totalGoals} (${totalGoals > line ? 'Mais que ' + line : 'Menos que ' + line})`;
          } else if (sel.toLowerCase().includes('menos') || sel.toLowerCase().includes('under')) {
            outcome = totalGoals < line ? 'won' : 'lost';
            reason = `Total de Gols: ${totalGoals} (${totalGoals < line ? 'Menos que ' + line : 'Mais que ' + line})`;
          }
        }
      }

      if (outcome) {
        evaluatedCount++;
        batch.update(d.ref, {
          evaluatedResult: outcome,
          evaluatedReason: reason,
          autoEvaluatedAt: new Date().toISOString()
        });
      }
    });

    if (evaluatedCount > 0) {
      await batch.commit();
    }

    return evaluatedCount;
  } catch (error) {
    console.error("Error auto evaluating match bets:", error);
    return 0;
  }
}

