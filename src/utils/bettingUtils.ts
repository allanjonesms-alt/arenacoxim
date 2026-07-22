import { collection, query, where, getDocs, doc, runTransaction } from 'firebase/firestore';

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
