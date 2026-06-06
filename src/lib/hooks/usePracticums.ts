import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { PracticumDocument } from '@/types';
import { useAuth } from './useAuth';

export function usePracticums() {
  const { user } = useAuth();
  const [practicums, setPracticums] = useState<PracticumDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'practicums'), orderBy('code', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as PracticumDocument));
      // Apply natural sort (A1, A2, A10)
      data.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
      setPracticums(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching practicums:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  return { practicums, loading };
}
