import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { PolicySingleton } from '@/types';
import { useAuth } from './useAuth';

export function usePolicy() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<PolicySingleton | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchPolicy = async () => {
      try {
        const policyRef = doc(db, 'policy', 'current');
        const docSnap = await getDoc(policyRef);
        if (docSnap.exists()) {
          setPolicy(docSnap.data() as PolicySingleton);
        }
      } catch (err) {
        console.error("Error fetching policy:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
  }, [user?.uid]);

  return { policy, loading };
}
