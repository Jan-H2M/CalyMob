/**
 * BrandingContactEditor - Modal pour modifier les informations de contact
 */

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { X, Loader2, Globe, Phone, Mail, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import { BrandingLibrary } from '@/types/branding';

interface BrandingContactEditorProps {
  library: BrandingLibrary;
  onClose: () => void;
  onSave: () => void;
}

export default function BrandingContactEditor({ library, onClose, onSave }: BrandingContactEditorProps) {
  const { clubId, user } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    websiteUrl: library.contact.websiteUrl || '',
    facebookUrl: library.contact.facebookUrl || '',
    instagramUrl: library.contact.instagramUrl || '',
    email: library.contact.email || '',
    phone: library.contact.phone || '',
    address: library.contact.address || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!clubId) return;

    try {
      setSaving(true);

      await BrandingService.saveBrandingLibrary(
        clubId,
        {
          contact: {
            websiteUrl: formData.websiteUrl || undefined,
            facebookUrl: formData.facebookUrl || undefined,
            instagramUrl: formData.instagramUrl || undefined,
            email: formData.email || undefined,
            phone: formData.phone || undefined,
            address: formData.address || undefined,
          },
        },
        user?.uid
      );

      toast.success('Contact mis a jour');
      onSave();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Informations de Contact
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <Globe className="h-4 w-4 inline mr-2" />
              Site web
            </label>
            <input
              type="url"
              value={formData.websiteUrl}
              onChange={e => setFormData({ ...formData, websiteUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="https://www.monclub.be"
            />
          </div>

          {/* Facebook */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <svg className="h-4 w-4 inline mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </label>
            <input
              type="url"
              value={formData.facebookUrl}
              onChange={e => setFormData({ ...formData, facebookUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="https://www.facebook.com/monclub"
            />
          </div>

          {/* Instagram */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <svg className="h-4 w-4 inline mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              Instagram
            </label>
            <input
              type="url"
              value={formData.instagramUrl}
              onChange={e => setFormData({ ...formData, instagramUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="https://www.instagram.com/monclub"
            />
          </div>

          <hr className="border-gray-200 dark:border-dark-border" />

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <Mail className="h-4 w-4 inline mr-2" />
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="contact@monclub.be"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <Phone className="h-4 w-4 inline mr-2" />
              Telephone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
              placeholder="+32 xxx xx xx xx"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <MapPin className="h-4 w-4 inline mr-2" />
              Adresse
            </label>
            <textarea
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary resize-none"
              placeholder="Rue Example 123, 1000 Bruxelles"
            />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Apercu (footer email)
            </label>
            <div className="p-4 border border-gray-200 dark:border-dark-border rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary text-center text-sm text-gray-600 dark:text-dark-text-secondary">
              {formData.websiteUrl && (
                <p className="mb-1">
                  <a href={formData.websiteUrl} className="text-calypso-blue hover:underline">
                    {formData.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </p>
              )}
              <div className="flex items-center justify-center gap-4 mb-2">
                {formData.facebookUrl && (
                  <a href={formData.facebookUrl} className="text-gray-500 dark:text-dark-text-muted hover:text-calypso-blue">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                )}
                {formData.instagramUrl && (
                  <a href={formData.instagramUrl} className="text-gray-500 dark:text-dark-text-muted hover:text-calypso-blue">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                )}
              </div>
              {formData.email && (
                <p className="mb-1">
                  <a href={`mailto:${formData.email}`} className="hover:text-calypso-blue">
                    {formData.email}
                  </a>
                </p>
              )}
              {formData.phone && <p className="mb-1">{formData.phone}</p>}
              {formData.address && <p className="text-xs">{formData.address}</p>}
              {!formData.websiteUrl && !formData.facebookUrl && !formData.instagramUrl && !formData.email && !formData.phone && !formData.address && (
                <p className="text-gray-400 dark:text-dark-text-muted italic">Aucune information de contact</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}
