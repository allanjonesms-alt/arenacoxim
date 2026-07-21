import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { PublicBettingMarkets } from './PublicBettingMarkets';
import { useNavigate } from 'react-router-dom';

interface UserBettingDashboardProps {
  user: any;
  isMaster?: boolean;
}

export function UserBettingDashboard({ user, isMaster }: UserBettingDashboardProps) {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    if (!user) return;

    let unsubscribeUser: () => void;

    const loadUserData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          // Initialize user
          await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            balance: 0,
            createdAt: new Date().toISOString()
          });
        }

        unsubscribeUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setBalance(snap.data().balance || 0);
          }
        });

      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <PublicBettingMarkets user={user} balance={balance} onRequestDeposit={() => navigate('/banco')} />
    </div>
  );
}

