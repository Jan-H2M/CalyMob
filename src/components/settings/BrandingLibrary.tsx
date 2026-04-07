import { logger } from '@/utils/logger';
/**
 * BrandingLibrary - Bibliotheque de ressources de branding du club
 * Nouvelle architecture: collection d'assets reutilisables (logos, palettes, images, templates)
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  Plus,
  Palette,
  Image as ImageIcon,
  Type,
  Code,
  Building2,
  Phone,
  Loader2,
  Edit2,
  Trash2,
  Star,
  StarOff,
  Eye,
  MoreVertical,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  BrandingLibrary as BrandingLibraryType,
  BrandingLogo,
  ColorPalette,
  BrandingImage,
  HtmlTemplate,
  DEFAULT_BRANDING_LIBRARY,
  generateLogoStyles,
  generateGradient,
} from '@/types/branding';
import { SettingsHeader } from './SettingsHeader';
import { cn } from '@/utils/utils';

// Import modal editors
import BrandingIdentityEditor from './BrandingIdentityEditor';
import BrandingContactEditor from './BrandingContactEditor';
import BrandingLogoEditor from './BrandingLogoEditor';
import BrandingPaletteEditor from './BrandingPaletteEditor';
import BrandingImageEditor from './BrandingImageEditor';
import BrandingTemplateEditor from './BrandingTemplateEditor';

type ModalType = 'identity' | 'contact' | 'logo' | 'palette' | 'image' | 'template' | null;

export default function BrandingLibrary() {
  const { clubId, user } = useAuth();

  // Main library state
  const [library, setLibrary] = useState<BrandingLibraryType>(DEFAULT_BRANDING_LIBRARY);
  const [logos, setLogos] = useState<BrandingLogo[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [images, setImages] = useState<BrandingImage[]>([]);
  const [templates, setTemplates] = useState<HtmlTemplate[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingItem, setEditingItem] = useState<BrandingLogo | ColorPalette | BrandingImage | HtmlTemplate | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setMenuOpen(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const context = await BrandingService.loadBrandingContext(clubId);
      setLibrary(context.library);
      setLogos(context.logos);
      setPalettes(context.palettes);
      setImages(context.images);
      setTemplates(context.templates);
    } catch (error) {
      logger.error('Error loading branding data:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Modal handlers
  const openModal = (type: ModalType, item?: BrandingLogo | ColorPalette | BrandingImage | HtmlTemplate) => {
    setModalType(type);
    setEditingItem(item || null);
    setMenuOpen(null);
  };

  const closeModal = () => {
    setModalType(null);
    setEditingItem(null);
  };

  const handleSave = async () => {
    await loadData();
    closeModal();
  };

  // Delete handlers
  const handleDeleteLogo = async (logo: BrandingLogo) => {
    if (!clubId) return;
    if (!window.confirm(`Supprimer le logo "${logo.name}" ?`)) return;

    try {
      setActionLoading(logo.id);
      await BrandingService.deleteLogo(clubId, logo.id, logo.url);
      await loadData();
      toast.success('Logo supprime');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  const handleDeletePalette = async (palette: ColorPalette) => {
    if (!clubId) return;
    if (!window.confirm(`Supprimer la palette "${palette.name}" ?`)) return;

    try {
      setActionLoading(palette.id);
      await BrandingService.deletePalette(clubId, palette.id);
      await loadData();
      toast.success('Palette supprimee');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  const handleDeleteImage = async (image: BrandingImage) => {
    if (!clubId) return;
    if (!window.confirm(`Supprimer l'image "${image.name}" ?`)) return;

    try {
      setActionLoading(image.id);
      await BrandingService.deleteImage(clubId, image.id, image.url);
      await loadData();
      toast.success('Image supprimee');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  const handleDeleteTemplate = async (template: HtmlTemplate) => {
    if (!clubId) return;
    if (!window.confirm(`Supprimer le template "${template.name}" ?`)) return;

    try {
      setActionLoading(template.id);
      await BrandingService.deleteTemplate(clubId, template.id);
      await loadData();
      toast.success('Template supprime');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la suppression';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  // Set default handlers
  const handleSetDefaultLogo = async (logo: BrandingLogo) => {
    if (!clubId) return;

    try {
      setActionLoading(logo.id);
      await BrandingService.saveBrandingLibrary(clubId, { defaultLogoId: logo.id }, user?.uid);
      await loadData();
      toast.success('Logo par defaut defini');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  const handleSetDefaultPalette = async (palette: ColorPalette) => {
    if (!clubId) return;

    try {
      setActionLoading(palette.id);
      await BrandingService.saveBrandingLibrary(clubId, { defaultPaletteId: palette.id }, user?.uid);
      await loadData();
      toast.success('Palette par defaut definie');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur';
      toast.error(message);
    } finally {
      setActionLoading(null);
      setMenuOpen(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <SettingsHeader
          breadcrumb={['Parametres', 'Communication', 'Bibliotheque de Branding']}
          title="Bibliotheque de Branding"
          description="Collection de ressources visuelles pour vos communications"
        />

        {/* Identity Section */}
        <Section
          icon={<Building2 className="h-5 w-5" />}
          title="Identite du Club"
          onEdit={() => openModal('identity')}
        >
          <div className="p-4">
            <p className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
              {library.identity.clubName}
            </p>
            {library.identity.slogan && (
              <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary italic">
                "{library.identity.slogan}"
              </p>
            )}
            {library.identity.description && (
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mt-2">
                {library.identity.description}
              </p>
            )}
          </div>
        </Section>

        {/* Logos Section */}
        <Section
          icon={<ImageIcon className="h-5 w-5" />}
          title="Logos"
          onAdd={() => openModal('logo')}
        >
          {logos.length === 0 ? (
            <EmptyState
              message="Aucun logo"
              onAdd={() => openModal('logo')}
            />
          ) : (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {logos.map(logo => (
                <LogoCard
                  key={logo.id}
                  logo={logo}
                  isDefault={library.defaultLogoId === logo.id}
                  isLoading={actionLoading === logo.id}
                  menuOpen={menuOpen === logo.id}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === logo.id ? null : logo.id);
                  }}
                  onEdit={() => openModal('logo', logo)}
                  onSetDefault={() => handleSetDefaultLogo(logo)}
                  onDelete={() => handleDeleteLogo(logo)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Palettes Section */}
        <Section
          icon={<Palette className="h-5 w-5" />}
          title="Palettes de Couleurs"
          onAdd={() => openModal('palette')}
        >
          {palettes.length === 0 ? (
            <EmptyState
              message="Aucune palette"
              onAdd={() => openModal('palette')}
            />
          ) : (
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {palettes.map(palette => (
                <PaletteCard
                  key={palette.id}
                  palette={palette}
                  isDefault={library.defaultPaletteId === palette.id}
                  isLoading={actionLoading === palette.id}
                  menuOpen={menuOpen === palette.id}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === palette.id ? null : palette.id);
                  }}
                  onEdit={() => openModal('palette', palette)}
                  onSetDefault={() => handleSetDefaultPalette(palette)}
                  onDelete={() => handleDeletePalette(palette)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Images Section */}
        <Section
          icon={<ImageIcon className="h-5 w-5" />}
          title="Images & Assets"
          onAdd={() => openModal('image')}
        >
          {images.length === 0 ? (
            <EmptyState
              message="Aucune image"
              onAdd={() => openModal('image')}
            />
          ) : (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {images.map(image => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isLoading={actionLoading === image.id}
                  menuOpen={menuOpen === image.id}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === image.id ? null : image.id);
                  }}
                  onEdit={() => openModal('image', image)}
                  onDelete={() => handleDeleteImage(image)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Templates Section */}
        <Section
          icon={<Code className="h-5 w-5" />}
          title="Templates HTML de Reference"
          onAdd={() => openModal('template')}
        >
          {templates.length === 0 ? (
            <EmptyState
              message="Aucun template"
              onAdd={() => openModal('template')}
            />
          ) : (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isLoading={actionLoading === template.id}
                  menuOpen={menuOpen === template.id}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === template.id ? null : template.id);
                  }}
                  onEdit={() => openModal('template', template)}
                  onDelete={() => handleDeleteTemplate(template)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Contact Section */}
        <Section
          icon={<Phone className="h-5 w-5" />}
          title="Informations de Contact"
          onEdit={() => openModal('contact')}
        >
          <div className="p-4 space-y-2">
            {library.contact.websiteUrl && (
              <p className="text-sm">
                <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Site: </span>
                <a href={library.contact.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-calypso-blue hover:underline">
                  {library.contact.websiteUrl}
                </a>
              </p>
            )}
            {library.contact.email && (
              <p className="text-sm">
                <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Email: </span>
                <span className="text-gray-900 dark:text-dark-text-primary">{library.contact.email}</span>
              </p>
            )}
            {library.contact.phone && (
              <p className="text-sm">
                <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Tel: </span>
                <span className="text-gray-900 dark:text-dark-text-primary">{library.contact.phone}</span>
              </p>
            )}
            {library.contact.facebookUrl && (
              <p className="text-sm">
                <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Facebook: </span>
                <a href={library.contact.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-calypso-blue hover:underline">
                  {library.contact.facebookUrl}
                </a>
              </p>
            )}
            {library.contact.instagramUrl && (
              <p className="text-sm">
                <span className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">Instagram: </span>
                <a href={library.contact.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-calypso-blue hover:underline">
                  {library.contact.instagramUrl}
                </a>
              </p>
            )}
            {!library.contact.websiteUrl && !library.contact.email && !library.contact.phone && (
              <p className="text-sm text-gray-400 dark:text-dark-text-muted italic">Aucune information de contact</p>
            )}
          </div>
        </Section>
      </div>

      {/* Modals */}
      {modalType === 'identity' && (
        <BrandingIdentityEditor
          library={library}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modalType === 'contact' && (
        <BrandingContactEditor
          library={library}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modalType === 'logo' && (
        <BrandingLogoEditor
          logo={editingItem as BrandingLogo | null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modalType === 'palette' && (
        <BrandingPaletteEditor
          palette={editingItem as ColorPalette | null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modalType === 'image' && (
        <BrandingImageEditor
          image={editingItem as BrandingImage | null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
      {modalType === 'template' && (
        <BrandingTemplateEditor
          template={editingItem as HtmlTemplate | null}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ============================================
// Section Component
// ============================================

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  onEdit?: () => void;
}

function Section({ icon, title, children, onAdd, onEdit }: SectionProps) {
  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-calypso-blue">{icon}</span>
          <h2 className="font-semibold text-gray-900 dark:text-dark-text-primary">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-calypso-blue text-white rounded hover:bg-calypso-blue-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              Modifier
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
  message: string;
  onAdd: () => void;
}

function EmptyState({ message, onAdd }: EmptyStateProps) {
  return (
    <div className="p-8 text-center">
      <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary mb-4">{message}</p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
      >
        <Plus className="h-4 w-4" />
        Ajouter
      </button>
    </div>
  );
}

// ============================================
// Logo Card
// ============================================

interface LogoCardProps {
  logo: BrandingLogo;
  isDefault: boolean;
  isLoading: boolean;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

function LogoCard({ logo, isDefault, isLoading, menuOpen, onMenuToggle, onEdit, onSetDefault, onDelete }: LogoCardProps) {
  const logoStyles = generateLogoStyles(logo);

  return (
    <div
      className={cn(
        'relative bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-calypso-blue/50 transition-all',
        isDefault && 'ring-2 ring-calypso-blue'
      )}
      onClick={onEdit}
    >
      {/* Logo preview */}
      <div className="aspect-square flex items-center justify-center p-4">
        {logo.url ? (
          <img
            src={logo.url}
            alt={logo.name}
            className="max-h-full max-w-full object-contain"
            style={logoStyles}
          />
        ) : (
          <ImageIcon className="h-12 w-12 text-gray-400 dark:text-dark-text-muted" />
        )}
      </div>

      {/* Default badge */}
      {isDefault && (
        <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
          <Star className="h-3 w-3" />
        </div>
      )}

      {/* Menu */}
      <div className="absolute top-2 right-2">
        <button
          onClick={onMenuToggle}
          disabled={isLoading}
          className="p-1.5 bg-white/80 dark:bg-dark-bg-secondary/80 rounded-full shadow hover:bg-white dark:hover:bg-dark-bg-secondary transition-colors"
          aria-label="Menu"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </button>

        {menuOpen && !isLoading && (
          <ItemMenu
            onEdit={onEdit}
            onSetDefault={!isDefault ? onSetDefault : undefined}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Name */}
      <div className="px-3 py-2 bg-white dark:bg-dark-bg-secondary border-t border-gray-200 dark:border-dark-border">
        <p className="text-sm font-medium truncate">{logo.name}</p>
        <p className="text-xs text-gray-500 dark:text-dark-text-muted">{logo.type}</p>
      </div>
    </div>
  );
}

// ============================================
// Palette Card
// ============================================

interface PaletteCardProps {
  palette: ColorPalette;
  isDefault: boolean;
  isLoading: boolean;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

function PaletteCard({ palette, isDefault, isLoading, menuOpen, onMenuToggle, onEdit, onSetDefault, onDelete }: PaletteCardProps) {
  const gradient = generateGradient(palette.primary, palette.secondary);

  return (
    <div
      className={cn(
        'relative bg-white dark:bg-dark-bg-secondary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-calypso-blue/50 shadow transition-all',
        isDefault && 'ring-2 ring-calypso-blue'
      )}
      onClick={onEdit}
    >
      {/* Gradient preview */}
      <div className="h-16" style={{ background: gradient }} />

      {/* Default badge */}
      {isDefault && (
        <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
          <Star className="h-3 w-3" />
        </div>
      )}

      {/* Menu */}
      <div className="absolute top-2 right-2">
        <button
          onClick={onMenuToggle}
          disabled={isLoading}
          className="p-1.5 bg-white/80 dark:bg-dark-bg-secondary/80 rounded-full shadow hover:bg-white dark:hover:bg-dark-bg-secondary transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4 text-white" />
          )}
        </button>

        {menuOpen && !isLoading && (
          <ItemMenu
            onEdit={onEdit}
            onSetDefault={!isDefault ? onSetDefault : undefined}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-medium text-gray-900 dark:text-dark-text-primary mb-2">{palette.name}</p>
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 rounded-full shadow" style={{ backgroundColor: palette.primary }} title="Primary" />
          <div className="w-6 h-6 rounded-full shadow" style={{ backgroundColor: palette.secondary }} title="Secondary" />
          <div className="w-6 h-6 rounded-full shadow" style={{ backgroundColor: palette.accent }} title="Accent" />
          <div className="w-6 h-6 rounded-full shadow border" style={{ backgroundColor: palette.background }} title="Background" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Image Card
// ============================================

interface ImageCardProps {
  image: BrandingImage;
  isLoading: boolean;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ImageCard({ image, isLoading, menuOpen, onMenuToggle, onEdit, onDelete }: ImageCardProps) {
  return (
    <div
      className="relative bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-calypso-blue/50 transition-all"
      onClick={onEdit}
    >
      {/* Image preview */}
      <div className="aspect-video flex items-center justify-center bg-gray-200 dark:bg-dark-bg-tertiary">
        {image.url ? (
          <img
            src={image.url}
            alt={image.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="h-12 w-12 text-gray-400 dark:text-dark-text-muted" />
        )}
      </div>

      {/* Type badge */}
      <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-0.5 rounded text-xs">
        {image.type}
      </div>

      {/* Menu */}
      <div className="absolute top-2 right-2">
        <button
          onClick={onMenuToggle}
          disabled={isLoading}
          className="p-1.5 bg-white/80 dark:bg-dark-bg-secondary/80 rounded-full shadow hover:bg-white dark:hover:bg-dark-bg-secondary transition-colors"
          aria-label="Menu"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </button>

        {menuOpen && !isLoading && (
          <ItemMenu
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Name */}
      <div className="px-3 py-2 bg-white dark:bg-dark-bg-secondary border-t border-gray-200 dark:border-dark-border">
        <p className="text-sm font-medium truncate">{image.name}</p>
      </div>
    </div>
  );
}

// ============================================
// Template Card
// ============================================

interface TemplateCardProps {
  template: HtmlTemplate;
  isLoading: boolean;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, isLoading, menuOpen, onMenuToggle, onEdit, onDelete }: TemplateCardProps) {
  return (
    <div
      className="relative bg-white dark:bg-dark-bg-secondary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-calypso-blue/50 shadow transition-all"
      onClick={onEdit}
    >
      {/* Preview area */}
      <div className="h-32 bg-gray-100 dark:bg-dark-bg-tertiary flex items-center justify-center overflow-hidden">
        {template.previewUrl ? (
          <img
            src={template.previewUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : template.html ? (
          <iframe
            srcDoc={template.html}
            title={template.name}
            className="w-full h-full border-0 pointer-events-none"
            sandbox=""
          />
        ) : (
          <Code className="h-12 w-12 text-gray-400 dark:text-dark-text-muted" />
        )}
      </div>

      {/* Menu */}
      <div className="absolute top-2 right-2">
        <button
          onClick={onMenuToggle}
          disabled={isLoading}
          className="p-1.5 bg-white/80 dark:bg-dark-bg-secondary/80 rounded-full shadow hover:bg-white dark:hover:bg-dark-bg-secondary transition-colors"
          aria-label="Menu"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </button>

        {menuOpen && !isLoading && (
          <ItemMenu
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-medium text-gray-900 dark:text-dark-text-primary">{template.name}</p>
        {template.description && (
          <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary line-clamp-2 mt-1">
            {template.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// Item Menu
// ============================================

interface ItemMenuProps {
  onEdit: () => void;
  onSetDefault?: () => void;
  onDelete: () => void;
}

function ItemMenu({ onEdit, onSetDefault, onDelete }: ItemMenuProps) {
  return (
    <div
      className="absolute right-0 mt-1 w-40 bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg border border-gray-200 dark:border-dark-border py-1 z-10"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={onEdit}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary flex items-center gap-2"
      >
        <Edit2 className="h-4 w-4" />
        Modifier
      </button>
      {onSetDefault && (
        <button
          onClick={onSetDefault}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary flex items-center gap-2"
        >
          <Star className="h-4 w-4" />
          Par defaut
        </button>
      )}
      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Supprimer
      </button>
    </div>
  );
}
