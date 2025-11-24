import React from 'react';
import { Calendar, CheckCircle, Lock, LockKeyhole, Clock } from 'lucide-react';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { cn } from '@/utils/utils';
import { differenceInDays } from 'date-fns';

// ============================================================================
// VERSION COMPACTE (pour headers de pages)
// ============================================================================

export function FiscalYearSelectorCompact() {
  const { allFiscalYears, selectedFiscalYear, setSelectedFiscalYear, loading } = useFiscalYear();

  if (loading || !selectedFiscalYear) {
    return (
      <div className="flex items-center gap-3 text-gray-500">
        <Calendar className="w-5 h-5 animate-pulse" />
        <span className="text-base font-medium">Chargement...</span>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return '✅';
      case 'closed': return '🔒';
      case 'permanently_closed': return '🔐';
      default: return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-50 border-green-300 text-green-900';
      case 'closed': return 'bg-orange-50 border-orange-300 text-orange-900';
      case 'permanently_closed': return 'bg-red-50 border-red-300 text-red-900';
      default: return 'bg-gray-50 border-gray-300 text-gray-900';
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
      <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
          Année Fiscale
        </span>
        <select
          value={selectedFiscalYear.id}
          onChange={(e) => {
            const fy = allFiscalYears.find(y => y.id === e.target.value);
            if (fy) setSelectedFiscalYear(fy);
          }}
          className={cn(
            "mt-0.5 px-3 py-1 border-2 rounded-md text-base font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            getStatusColor(selectedFiscalYear.status)
          )}
        >
          {allFiscalYears.map(fy => (
            <option key={fy.id} value={fy.id}>
              {fy.year} {getStatusIcon(fy.status)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ============================================================================
// VERSION COMPLÈTE (standalone avec détails)
// ============================================================================

export function FiscalYearSelector() {
  const {
    allFiscalYears,
    selectedFiscalYear,
    currentFiscalYear,
    setSelectedFiscalYear,
    loading
  } = useFiscalYear();

  if (loading || !selectedFiscalYear) {
    return (
      <div className="w-80 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Calendar className="w-5 h-5 animate-pulse" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  const daysRemaining = selectedFiscalYear.status === 'open'
    ? Math.max(0, differenceInDays(selectedFiscalYear.end_date, new Date()))
    : null;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Ouverte';
      case 'closed': return 'Clôturée';
      case 'permanently_closed': return 'Verrouillée';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800 border-green-300';
      case 'closed': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'permanently_closed': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <CheckCircle className="w-4 h-4" />;
      case 'closed': return <Lock className="w-4 h-4" />;
      case 'permanently_closed': return <LockKeyhole className="w-4 h-4" />;
      default: return null;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="w-80 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-5 h-5 text-blue-600" />
        <span className="text-sm font-semibold text-gray-700">Année Fiscale</span>
      </div>

      {/* Select */}
      <select
        value={selectedFiscalYear.id}
        onChange={(e) => {
          const fy = allFiscalYears.find(y => y.id === e.target.value);
          if (fy) setSelectedFiscalYear(fy);
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-3"
      >
        {allFiscalYears.map(fy => (
          <option key={fy.id} value={fy.id}>
            {fy.year} ({getStatusLabel(fy.status)})
            {fy.id === currentFiscalYear?.id ? ' - Active' : ''}
          </option>
        ))}
      </select>

      {/* Badge Status */}
      <div className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border mb-3',
        getStatusColor(selectedFiscalYear.status)
      )}>
        {getStatusIcon(selectedFiscalYear.status)}
        <span>{getStatusLabel(selectedFiscalYear.status)}</span>
      </div>

      {/* Période */}
      <div className="text-sm text-gray-600 mb-2">
        {formatDate(selectedFiscalYear.start_date)} → {formatDate(selectedFiscalYear.end_date)}
      </div>

      {/* Countdown */}
      {daysRemaining !== null && daysRemaining >= 0 && (
        <div className="text-sm text-blue-600 font-medium flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>
            {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} restant{daysRemaining > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {daysRemaining !== null && daysRemaining < 0 && selectedFiscalYear.status === 'open' && (
        <div className="text-sm text-orange-600 font-medium">
          ⚠️ Année terminée - Clôture recommandée
        </div>
      )}
    </div>
  );
}
