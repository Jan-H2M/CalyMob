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

    const isVPDive = operation.source === 'vpdive';

    // Styles based on source
    const badgeStyle = isVPDive
        ? 'bg-orange-100 text-orange-700 border-orange-200'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200';

    const Icon = isVPDive ? DownloadCloud : CheckCircle;
    const label = isVPDive ? 'VPDive' : 'Caly';

    return (
        <div className={`
      inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium
      ${badgeStyle}
    `}>
            <Icon className="w-3 h-3 mr-1" />
            <span>{label}</span>

            {showLock && operation.isEditable === false && (
                <Lock className="w-3 h-3 ml-1 text-gray-400" />
            )}
        </div>
    );
};
