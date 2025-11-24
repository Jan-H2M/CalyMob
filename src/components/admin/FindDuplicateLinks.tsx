import React, { useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface MatchedEntity {
  entity_type: 'participant' | 'expense' | 'event' | 'member' | 'demand' | 'inscription';
  entity_id: string;
  entity_name?: string;
}

interface DuplicateInfo {
  key: string;
  indices: number[];
  count: number;
}

interface TransactionAnalysis {
  id: string;
  numeroSequence: string;
  montant: number;
  dateExecution: any;
  contrepartieName?: string;
  communication?: string;
  matchedCount: number;
  matchedEntities: MatchedEntity[];
  duplicates: DuplicateInfo[];
  hasDuplicates: boolean;
}

export function FindDuplicateLinks() {
  const { clubId } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [results, setResults] = useState<{
    totalTransactions: number;
    transactionsWithLinks: number;
    multiLinked: TransactionAnalysis[];
    withDuplicates: TransactionAnalysis[];
  } | null>(null);

  const findDuplicateLinks = (matchedEntities: MatchedEntity[]): DuplicateInfo[] => {
    const seen = new Map<string, number[]>();
    const duplicates: DuplicateInfo[] = [];

    matchedEntities.forEach((entity, index) => {
      const key = `${entity.entity_type}:${entity.entity_id}`;
      if (seen.has(key)) {
        seen.get(key)!.push(index);
      } else {
        seen.set(key, [index]);
      }
    });

    seen.forEach((indices, key) => {
      if (indices.length > 1) {
        duplicates.push({ key, indices, count: indices.length });
      }
    });

    return duplicates;
  };

  const removeDuplicateLinks = (matchedEntities: MatchedEntity[]): MatchedEntity[] => {
    const seen = new Set<string>();
    const cleaned: MatchedEntity[] = [];

    matchedEntities.forEach(entity => {
      const key = `${entity.entity_type}:${entity.entity_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(entity);
      }
    });

    return cleaned;
  };

  const analyze = async () => {
    if (!clubId) {
      toast.error('Geen club ID gevonden');
      return;
    }

    setAnalyzing(true);
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const snapshot = await getDocs(transactionsRef);

      const multiLinked: TransactionAnalysis[] = [];
      const withDuplicates: TransactionAnalysis[] = [];
      let totalTransactions = 0;
      let transactionsWithLinks = 0;

      snapshot.forEach(docSnap => {
        totalTransactions++;
        const data = docSnap.data();
        const matchedEntities = (data.matched_entities || []) as MatchedEntity[];

        if (matchedEntities.length > 0) {
          transactionsWithLinks++;
        }

        if (matchedEntities.length > 1) {
          const duplicates = findDuplicateLinks(matchedEntities);
          const hasDuplicates = duplicates.length > 0;

          const analysis: TransactionAnalysis = {
            id: docSnap.id,
            numeroSequence: data.numero_sequence,
            montant: data.montant,
            dateExecution: data.date_execution?.toDate?.() || data.date_execution,
            contrepartieName: data.contrepartie_nom,
            communication: data.communication,
            matchedCount: matchedEntities.length,
            matchedEntities,
            duplicates,
            hasDuplicates
          };

          multiLinked.push(analysis);

          if (hasDuplicates) {
            withDuplicates.push(analysis);
          }
        }
      });

      // Sort: duplicates first, then by link count
      multiLinked.sort((a, b) => {
        if (a.hasDuplicates !== b.hasDuplicates) return a.hasDuplicates ? -1 : 1;
        return b.matchedCount - a.matchedCount;
      });

      setResults({
        totalTransactions,
        transactionsWithLinks,
        multiLinked,
        withDuplicates
      });

      toast.success(`Analyse compleet! ${withDuplicates.length} transacties met duplicaten gevonden.`);
    } catch (error) {
      console.error('Error analyzing:', error);
      toast.error('Fout bij analyse: ' + (error as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const fix = async () => {
    if (!clubId || !results?.withDuplicates.length) return;

    if (!confirm(`Je gaat ${results.withDuplicates.length} transacties fixen. Doorgaan?`)) {
      return;
    }

    setFixing(true);
    let fixedCount = 0;

    try {
      for (const tx of results.withDuplicates) {
        const cleanedEntities = removeDuplicateLinks(tx.matchedEntities);
        const removedCount = tx.matchedEntities.length - cleanedEntities.length;

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', tx.id);
        await updateDoc(txRef, {
          matched_entities: cleanedEntities
        });

        fixedCount++;
        console.log(`✓ ${tx.numeroSequence}: ${tx.matchedEntities.length} → ${cleanedEntities.length} links (${removedCount} verwijderd)`);
      }

      toast.success(`${fixedCount} transacties gefixed!`);

      // Refresh analysis
      setTimeout(() => analyze(), 500);
    } catch (error) {
      console.error('Error fixing:', error);
      toast.error('Fout bij fixen: ' + (error as Error).message);
    } finally {
      setFixing(false);
    }
  };

  const exportJSON = () => {
    if (!results) return;

    const data = {
      generatedAt: new Date().toISOString(),
      statistics: {
        totalTransactions: results.totalTransactions,
        transactionsWithLinks: results.transactionsWithLinks,
        multiLinked: results.multiLinked.length,
        withDuplicates: results.withDuplicates.length
      },
      transactions: results.multiLinked
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multi-linked-transactions.json';
    a.click();
    URL.revokeObjectURL(url);

    toast.success('JSON exporté!');
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">🔍 Find Multi-Linked Transactions</h1>

      {/* Statistics */}
      {results && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4">
          <div className="font-semibold mb-2">📊 Statistieken:</div>
          <div className="space-y-1 text-sm">
            <div>Total transacties: {results.totalTransactions}</div>
            <div>Transacties met links: {results.transactionsWithLinks}</div>
            <div>Transacties met &gt;1 link: {results.multiLinked.length}</div>
            <div className="font-bold text-orange-600 dark:text-orange-400">
              Transacties met duplicaten: {results.withDuplicates.length}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={analyze}
          disabled={analyzing}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {analyzing ? '⏳ Analyzing...' : '📋 Analyze'}
        </button>

        <button
          onClick={fix}
          disabled={!results?.withDuplicates.length || fixing}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
        >
          {fixing ? '⏳ Fixing...' : '🔧 Fix Duplicates'}
        </button>

        <button
          onClick={exportJSON}
          disabled={!results}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          💾 Export JSON
        </button>
      </div>

      {/* Results */}
      {results && results.multiLinked.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">🔗 Transacties met meerdere links:</h2>

          {results.multiLinked.map((tx, index) => (
            <div
              key={tx.id}
              className={`border rounded-lg p-4 ${
                tx.hasDuplicates
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
            >
              <div className="font-semibold mb-2">
                [{index + 1}] {tx.numeroSequence}
                {tx.hasDuplicates && <span className="ml-2 text-orange-600">⚠️ DUPLICATEN</span>}
              </div>

              <div className="text-sm space-y-1 mb-3">
                <div>Montant: {tx.montant}€</div>
                <div>Datum: {tx.dateExecution?.toString()}</div>
                <div>Contrepartie: {tx.contrepartieName || '(geen)'}</div>
                <div>Aantal links: {tx.matchedCount}</div>
              </div>

              {tx.hasDuplicates && (
                <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded mb-3">
                  <div className="font-semibold text-orange-700 dark:text-orange-300 mb-1">
                    ⚠️ Duplicaten:
                  </div>
                  {tx.duplicates.map((dup, idx) => (
                    <div key={idx} className="text-sm">
                      - {dup.key} verschijnt {dup.count}x (indices: {dup.indices.join(', ')})
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="font-semibold text-sm mb-1">Links:</div>
                <div className="space-y-1">
                  {tx.matchedEntities.map((entity, idx) => (
                    <div key={idx} className="text-sm pl-4">
                      [{idx + 1}] {entity.entity_type} | {entity.entity_id} | {entity.entity_name || '(geen)'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results && results.multiLinked.length === 0 && (
        <div className="text-green-600 font-semibold">
          ✅ Geen transacties met meerdere links gevonden!
        </div>
      )}
    </div>
  );
}
