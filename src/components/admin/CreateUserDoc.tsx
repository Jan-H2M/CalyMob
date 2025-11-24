import React, { useState, useEffect } from 'react';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';

export function CreateUserDoc() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const createUserDocument = async () => {
    if (!user) {
      setStatus('❌ No user logged in');
      return;
    }

    setLoading(true);
    setStatus('🔄 Creating user document...');

    try {
      const clubId = 'calypso';
      const userDocPath = `clubs/${clubId}/members/${user.uid}`;

      console.log('🔍 Current user UID:', user.uid);
      console.log('🔍 Current user email:', user.email);
      console.log('📝 Creating document at:', userDocPath);

      const userDoc = {
        email: user.email,
        nom: "Demo",
        prenom: "User",
        role: "superadmin",
        actif: true,
        isActive: true,
        status: "active",
        created_at: Timestamp.now(),
        updated_at: Timestamp.now()
      };

      await setDoc(doc(db, userDocPath), userDoc, { merge: true });

      setStatus('✅ SUCCESS! User document created. Please reload the page (F5)');
      console.log('✅ User document created successfully');
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('❌ Error creating user document:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-dark-bg-secondary p-6 rounded-lg shadow-2xl border-2 border-blue-500 max-w-md z-50">
      <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-dark-text-primary">🔧 Admin Utility</h3>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          <strong>UID:</strong> {user.uid}
        </p>
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          <strong>Email:</strong> {user.email}
        </p>
        <button
          onClick={createUserDocument}
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {loading ? '⏳ Creating...' : '📝 Create Superadmin User Doc'}
        </button>
        {status && (
          <p className={`text-sm p-3 rounded ${
            status.includes('SUCCESS') ? 'bg-green-100 text-green-800' :
            status.includes('Error') ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
