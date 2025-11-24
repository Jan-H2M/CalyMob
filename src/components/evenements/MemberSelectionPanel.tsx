import React, { useState, useEffect } from 'react';
import { X, Search, Users } from 'lucide-react';
import { Membre } from '@/types';
import { getMembres } from '@/services/membreService';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

interface MemberSelectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMember: (member: Membre) => void;
  existingParticipantIds: string[];
}

export const MemberSelectionPanel: React.FC<MemberSelectionPanelProps> = ({
  isOpen,
  onClose,
  onSelectMember,
  existingParticipantIds
}) => {
  const { clubId } = useAuth();
  const [members, setMembers] = useState<Membre[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Membre[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && clubId) {
      loadMembers();
    }
  }, [isOpen, clubId]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredMembers(members);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = members.filter(member => {
        const fullName = `${member.prenom} ${member.nom}`.toLowerCase();
        const email = member.email?.toLowerCase() || '';
        return fullName.includes(term) || email.includes(term);
      });
      setFilteredMembers(filtered);
    }
  }, [searchTerm, members]);

  const loadMembers = async () => {
    if (!clubId) return;

    setIsLoading(true);
    try {
      const allMembers = await getMembres(clubId);
      const availableMembers = allMembers.filter(
        member => !existingParticipantIds.includes(member.id)
      );
      setMembers(availableMembers);
      setFilteredMembers(availableMembers);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Erreur lors du chargement des membres');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMember = (member: Membre) => {
    onSelectMember(member);
    onClose();
    setSearchTerm('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Ajouter un participant</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par nom ou email..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'Aucun membre trouvé' : 'Aucun membre disponible'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleSelectMember(member)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="font-medium">
                    {member.prenom} {member.nom}
                  </div>
                  {member.email && (
                    <div className="text-sm text-gray-600">{member.email}</div>
                  )}
                  {member.telephone && (
                    <div className="text-sm text-gray-500">{member.telephone}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {filteredMembers.length} membre{filteredMembers.length !== 1 ? 's' : ''} disponible{filteredMembers.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  );
};
