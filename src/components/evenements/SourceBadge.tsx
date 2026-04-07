import React from 'react';
import { Operation } from '../../types';
import { DownloadCloud, CheckCircle, Lock } from 'lucide-react';

interface SourceBadgeProps {
    operation: Operation;
    showLock?: boolean;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
    operation,
    showLock = true
}) => {
    if (!operation.source) return null;

    const isImported = operation.source !== 'caly';

    // Styles based on source
    const badgeStyle = isImported
        ? 'bg-orange-100 text-orange-700 border-orange-200'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200';

    const Icon = isImported ? DownloadCloud : CheckCircle;
    const label = isImported ? 'Import' : 'Caly';

    return (
        <div className={`
      inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium
      ${badgeStyle}
    `}>
            <Icon className="w-3 h-3 mr-1" />
            <span>{label}</span>

            {showLock && operation.isEditable === false && (
                <Lock className="w-3 h-3 ml-1 text-gray-400 dark:text-dark-text-muted" />
            )}
        </div>
    );
};
