import React, { useState, useEffect } from 'react';
import { Lock, Unlock, AlertTriangle, Calendar, ShieldCheck } from 'lucide-react';
import { AmortizationService, AmortizationSchedule } from '@/services/amortizationService';
import { InventoryItem, ItemType } from '@/types/inventory';
import { cn } from '@/utils/utils';

interface DepreciationLockingPanelProps {
  item: InventoryItem;
  itemType?: ItemType;
  schedule?: AmortizationSchedule;
  onItemLockChange: (locked: boolean) => void;
  onYearLockChange: (yearId: string, locked: boolean) => void;
  disabled?: boolean;
  /** Hide header when used inside an accordion */
  hideHeader?: boolean;
}

export function DepreciationLockingPanel({
  item,
  itemType,
  schedule,
  onItemLockChange,
  onYearLockChange,
  disabled = false,
  hideHeader = false
}: DepreciationLockingPanelProps) {
  const isItemLocked = item.depreciation_locked || false;
  const lockedYears = item.depreciation_locked_years || [];

  // Check if item lock can be modified
  const canModify = AmortizationService.canModifyDepreciation(item);

  return (
    <div className={hideHeader ? '' : 'bg-white border border-gray-200 dark:border-dark-border rounded-lg p-4'}>
      {!hideHeader && (
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Verrouillage de l'amortissement</h3>
        </div>
      )}

      {/* Item-level Lock */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-full',
              isItemLocked ? 'bg-red-100' : 'bg-green-100'
            )}>
              {isItemLocked ? (
                <Lock className="h-4 w-4 text-red-600" />
              ) : (
                <Unlock className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                Verrouillage de l'article
              </p>
              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                {isItemLocked
                  ? 'Toutes les modifications d\'amortissement sont bloquées'
                  : 'Les paramètres d\'amortissement peuvent être modifiés'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onItemLockChange(!isItemLocked)}
            disabled={disabled || !canModify.canModify}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              isItemLocked
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200',
              (disabled || !canModify.canModify) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isItemLocked ? 'Déverrouiller' : 'Verrouiller'}
          </button>
        </div>

        {!canModify.canModify && (
          <div className="mt-2 flex items-start gap-2 text-amber-700 bg-amber-50 p-2 rounded">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{canModify.reason}</p>
          </div>
        )}
      </div>

      {/* Year-level Locks */}
      {schedule && schedule.entries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
            <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">Verrouillage par année</p>
          </div>

          <div className="space-y-2">
            {schedule.entries.map((entry) => {
              const yearId = `FY${entry.year}`;
              const isYearLocked = entry.isLocked || lockedYears.includes(yearId);
              const isFiscalYearClosed = entry.isLocked && !lockedYears.includes(yearId);

              return (
                <div
                  key={entry.year}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-md border',
                    isYearLocked
                      ? 'bg-gray-50 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border'
                      : 'bg-white border-gray-100'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isYearLocked ? (
                      <Lock className="h-3.5 w-3.5 text-gray-500 dark:text-dark-text-muted" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
                    )}
                    <span className="text-sm text-gray-700 dark:text-dark-text-primary">{entry.year}</span>
                    {isFiscalYearClosed && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Exercice clôturé
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-dark-text-muted">
                      {entry.annualDepreciation.toLocaleString('fr-BE', { style: 'currency', currency: 'EUR' })}
                    </span>
                    {!isFiscalYearClosed && (
                      <button
                        onClick={() => onYearLockChange(yearId, !lockedYears.includes(yearId))}
                        disabled={disabled || isItemLocked}
                        className={cn(
                          'p-1 rounded transition-colors',
                          lockedYears.includes(yearId)
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-gray-400 dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary',
                          (disabled || isItemLocked) && 'opacity-50 cursor-not-allowed'
                        )}
                        title={lockedYears.includes(yearId) ? 'Déverrouiller cette année' : 'Verrouiller cette année'}
                      >
                        {lockedYears.includes(yearId) ? (
                          <Unlock className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {schedule.hasLockedYears && (
            <p className="mt-3 text-xs text-gray-500 dark:text-dark-text-muted flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Les années d'exercices clôturés sont automatiquement verrouillées
            </p>
          )}
        </div>
      )}

      {/* Warning for locked items */}
      {isItemLocked && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Article verrouillé</p>
              <p className="mt-1">
                Aucune modification des paramètres d'amortissement n'est possible.
                Déverrouillez l'article pour effectuer des modifications.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
