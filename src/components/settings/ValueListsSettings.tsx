/**
 * ValueListsSettings Component
 *
 * Beheer pagina voor waardelijsten (dynamische dropdowns).
 * Tabel met alle lijsten + CRUD operaties.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ValueListService } from '@/services/valueListService';
import type { ValueList } from '@/types/valueList.types';
import { TYPE_LABELS, TYPE_COLORS } from '@/types/valueList.types';
import ValueListDetailView from './ValueListDetailView';
import {
  Plus, Search, Edit2, List,
  Loader
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ValueListsSettings() {
  const { clubId, appUser } = useAuth();
  const [valueLists, setValueLists] = useState<ValueList[]>([]);
  const [filteredLists, setFilteredLists] = useState<ValueList[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailViewList, setDetailViewList] = useState<ValueList | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Load value lists
  useEffect(() => {
    if (!clubId) return;
    loadValueLists();
  }, [clubId]);

  // Filter lists based on search
  useEffect(() => {
    let filtered = valueLists;

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(list =>
        list.name.toLowerCase().includes(search) ||
        list.description?.toLowerCase().includes(search) ||
        list.id.toLowerCase().includes(search)
      );
    }

    setFilteredLists(filtered);
  }, [valueLists, searchTerm]);

  const loadValueLists = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const lists = await ValueListService.getValueLists(clubId);
      setValueLists(lists);
    } catch (error) {
      console.error('Error loading value lists:', error);
      toast.error('Erreur lors du chargement des listes');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = (list: ValueList) => {
    setDetailViewList(list);
    setIsCreateMode(false);
  };

  const handleCreateNew = () => {
    setIsCreateMode(true);
    setDetailViewList(null);
  };

  const handleCloseDetail = () => {
    setDetailViewList(null);
    setIsCreateMode(false);
    loadValueLists();
  };

  // Get type badge color
  const getTypeColor = (type: 'system' | 'club'): string => {
    const colorMap: Record<string, string> = {
      gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
    };
    return colorMap[TYPE_COLORS[type]] || colorMap['gray'];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            Listes de valeurs
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
            Gérez les dropdowns et options utilisés dans l'application
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle liste</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-text-tertiary" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher une liste..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg
            bg-white dark:bg-dark-bg-secondary
            text-gray-900 dark:text-dark-text-primary
            placeholder-gray-400 dark:placeholder-dark-text-tertiary
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredLists.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-dark-bg-secondary rounded-lg">
          <List className="w-12 h-12 text-gray-400 dark:text-dark-text-tertiary mx-auto mb-3" />
          <p className="text-gray-600 dark:text-dark-text-secondary">
            {searchTerm
              ? 'Aucune liste trouvée avec ces filtres'
              : 'Aucune liste de valeurs. Créez votre première liste.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                  # Items
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {filteredLists.map(list => (
                <tr
                  key={list.id}
                  className="hover:bg-gray-50 dark:hover:bg-dark-bg-secondary cursor-pointer transition-colors"
                  onClick={() => handleOpenDetail(list)}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {list.name}
                    </div>
                    {list.description && (
                      <div className="text-sm text-gray-500 dark:text-dark-text-secondary mt-0.5">
                        {list.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(list.type)}`}>
                      {TYPE_LABELS[list.type]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-dark-text-secondary">
                    {list.items.filter(i => i.active).length} actif{list.items.filter(i => i.active).length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(list);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail View Modal */}
      {(detailViewList || isCreateMode) && (
        <ValueListDetailView
          valueList={detailViewList}
          isCreateMode={isCreateMode}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
