import { logger } from '@/utils/logger';
/**
 * BrandingEditor - Modal for editing branding presets
 * Full editor with logo upload, colors, typography, header, footer, background settings
 */

import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  X,
  Upload,
  Trash2,
  Save,
  Loader2,
  Palette,
  Image as ImageIcon,
  Globe,
  Type,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layout,
  Square,
  Facebook,
  Instagram,
  Code,
  Copy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandingService } from '@/services/brandingService';
import {
  BrandingPreset,
  LogoStyle,
  EmailBackgroundType,
  DEFAULT_BRANDING_PRESET,
  generateGradient,
  generateLogoStyles,
  generateButtonStyles,
  FONT_OPTIONS,
} from '@/types/branding';
import ColorPicker, { ColorPresetSelector } from '@/components/ui/ColorPicker';
import { cn } from '@/utils/utils';

interface BrandingEditorProps {
  preset: BrandingPreset | null; // null = create new
  onClose: () => void;
  onSave: () => void;
}

// Collapsible section component
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-dark-text-primary uppercase tracking-wide">
          <Icon className="h-4 w-4" />
          {title}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
        )}
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export default function BrandingEditor({ preset, onClose, onSave }: BrandingEditorProps) {
  const { clubId, user } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const footerImageInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const isNew = !preset;

  // Form state
  const [formData, setFormData] = useState<Partial<BrandingPreset>>(() => {
    if (preset) {
      return { ...preset };
    }
    return {
      ...DEFAULT_BRANDING_PRESET,
      name: '',
      description: '',
      isDefault: false,
    };
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'footer' | 'background' | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // Force preview refresh
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'render'>('preview');
  const [htmlCode, setHtmlCode] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle form changes
  const handleChange = (field: keyof BrandingPreset, value: string | number | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-update gradient when colors change (unless custom is enabled)
      if ((field === 'primaryColor' || field === 'secondaryColor') && !prev.headerGradientCustom) {
        updated.headerGradient = generateGradient(
          field === 'primaryColor' ? (value as string) : prev.primaryColor || '#006994',
          field === 'secondaryColor' ? (value as string) : prev.secondaryColor
        );
      }

      return updated;
    });
  };

  // Apply color preset
  const handleApplyColorPreset = (colors: { primary: string; secondary: string; accent: string }) => {
    setFormData(prev => ({
      ...prev,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      accentColor: colors.accent,
      headerGradient: prev.headerGradientCustom ? prev.headerGradient : generateGradient(colors.primary, colors.secondary),
    }));
  };

  // Generic image upload handler
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'footerImageUrl' | 'emailBackgroundImageUrl',
    type: 'logo' | 'footer' | 'background'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !clubId) return;

    try {
      setUploading(type);

      // For new preset or if no preset id yet, use FileReader for preview
      if (!preset?.id) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFormData(prev => ({ ...prev, [field]: e.target?.result as string }));
        };
        reader.readAsDataURL(file);
        toast.success('Image selectionnee (sera uploadee a la sauvegarde)');
      } else {
        // Upload directly for existing preset
        let url: string;
        if (type === 'logo') {
          url = await BrandingService.uploadPresetLogo(clubId, preset.id, file);
        } else {
          url = await BrandingService.uploadPresetImage(clubId, preset.id, file, type);
        }
        setFormData(prev => ({ ...prev, [field]: url }));
        toast.success('Image uploadee');
      }
    } catch (error) {
      logger.error(`Error uploading ${type}:`, error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'upload");
    } finally {
      setUploading(null);
      // Reset input
      if (type === 'logo' && logoInputRef.current) logoInputRef.current.value = '';
      if (type === 'footer' && footerImageInputRef.current) footerImageInputRef.current.value = '';
      if (type === 'background' && bgImageInputRef.current) bgImageInputRef.current.value = '';
    }
  };

  // Remove image
  const handleRemoveImage = (field: 'logoUrl' | 'footerImageUrl' | 'emailBackgroundImageUrl') => {
    setFormData(prev => ({ ...prev, [field]: undefined }));
  };

  // Handle save
  const handleSave = async () => {
    if (!clubId || !user?.uid) return;

    // Validate
    if (!formData.name?.trim()) {
      toast.error('Le nom du style est requis');
      return;
    }
    if (!formData.clubName?.trim()) {
      toast.error('Le nom du club est requis');
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        await BrandingService.createBrandingPreset(
          clubId,
          {
            ...formData,
            name: formData.name!,
            clubName: formData.clubName!,
            primaryColor: formData.primaryColor || '#006994',
            createdBy: user.uid,
          } as Omit<BrandingPreset, 'id' | 'createdAt' | 'updatedAt'>,
          user.uid
        );
        toast.success('Style cree avec succes');
      } else {
        await BrandingService.updateBrandingPreset(clubId, preset.id, formData, user.uid);
        toast.success('Style mis a jour');
      }

      onSave();
    } catch (error) {
      logger.error('Error saving preset:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Force preview refresh
  const handleRefreshPreview = () => {
    setPreviewKey(prev => prev + 1);
    // If on code tab, regenerate HTML from branding settings
    if (activeTab === 'code') {
      setHtmlCode(generatePreviewHtml());
    }
    // If on render tab, update iframe with current htmlCode
    if (activeTab === 'render' && iframeRef.current) {
      iframeRef.current.srcdoc = htmlCode;
    }
  };

  // Update iframe when switching to render tab or when htmlCode changes
  const handleRenderTab = () => {
    setActiveTab('render');
    // If no custom HTML yet, generate from branding settings
    if (!htmlCode) {
      setHtmlCode(generatePreviewHtml());
    }
  };

  // Generate HTML for the email preview
  const generatePreviewHtml = () => {
    const gradient = formData.headerGradient ||
      generateGradient(formData.primaryColor || '#006994', formData.secondaryColor);

    const logoStyleCss = (() => {
      const style = formData.logoStyle || 'contained';
      const bgColor = formData.logoBackgroundColor || '#FFFFFF';
      const padding = formData.logoPadding ?? 8;
      const borderRadius = formData.logoBorderRadius ?? 8;

      switch (style) {
        case 'transparent':
          return 'background: transparent; padding: 0;';
        case 'circle':
          return `background: ${bgColor}; padding: ${padding}px; border-radius: 50%; overflow: hidden; display: inline-block;`;
        case 'contained':
        default:
          return `background: ${bgColor}; padding: ${padding}px; border-radius: ${borderRadius}px; overflow: hidden; display: inline-block;`;
      }
    })();

    const buttonStyleCss = `
      background-color: ${formData.accentColor || formData.primaryColor || '#006994'};
      color: #FFFFFF;
      border-radius: ${formData.buttonBorderRadius ?? 4}px;
      padding: ${formData.buttonPaddingV ?? 12}px ${formData.buttonPaddingH ?? 24}px;
      font-family: ${formData.fontFamily || 'Arial, sans-serif'};
      font-size: ${formData.bodyFontSize ?? 14}px;
      font-weight: 600;
      text-decoration: none;
      display: inline-block;
      border: none;
    `.replace(/\s+/g, ' ').trim();

    const emailBgCss = (() => {
      const bgType = formData.emailBackgroundType || 'solid';
      if (bgType === 'gradient' && formData.emailBackgroundGradient) {
        return `background: ${formData.emailBackgroundGradient};`;
      }
      if (bgType === 'image' && formData.emailBackgroundImageUrl) {
        return `background: url(${formData.emailBackgroundImageUrl}) center/cover no-repeat;`;
      }
      return `background-color: ${formData.emailBackgroundColor || '#F5F5F5'};`;
    })();

    const socialLinks = [];
    if (formData.websiteUrl) {
      socialLinks.push(`<a href="${formData.websiteUrl}" style="color: ${formData.primaryColor || '#006994'}; text-decoration: none; margin: 0 8px;">Site web</a>`);
    }
    if (formData.facebookUrl) {
      socialLinks.push(`<a href="${formData.facebookUrl}" style="color: ${formData.primaryColor || '#006994'}; text-decoration: none; margin: 0 8px;">Facebook</a>`);
    }
    if (formData.instagramUrl) {
      socialLinks.push(`<a href="${formData.instagramUrl}" style="color: ${formData.primaryColor || '#006994'}; text-decoration: none; margin: 0 8px;">Instagram</a>`);
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Preview</title>
</head>
<body style="margin: 0; padding: 0; ${emailBgCss}">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="background: ${gradient}; min-height: ${formData.headerHeight || 80}px; padding: ${formData.headerPadding || 20}px;">
              ${formData.logoUrl
                ? `<div style="${logoStyleCss}"><img src="${formData.logoUrl}" alt="${formData.clubName || 'Logo'}" style="max-height: 56px; max-width: 150px; display: block;" /></div>`
                : `<h2 style="color: #FFFFFF; font-family: ${formData.fontFamily || 'Arial, sans-serif'}; margin: 0;">${formData.clubName || 'Nom du Club'}</h2>`
              }
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: ${formData.contentBackgroundColor || '#FFFFFF'}; padding: 24px; font-family: ${formData.fontFamily || 'Arial, sans-serif'};">
              <h3 style="font-size: ${formData.titleFontSize || 24}px; color: ${formData.textColor || '#333333'}; margin: 0 0 8px 0;">
                Bienvenue chez ${formData.clubName || 'Nom du Club'}
              </h3>
              <p style="font-size: ${formData.bodyFontSize || 14}px; color: ${formData.textColor || '#333333'}; line-height: 1.5; margin: 0 0 16px 0;">
                Ceci est un apercu de l'apparence de vos emails avec ce style de branding.
                Les couleurs, typographie et logo seront appliques a toutes les communications.
              </p>
              <a href="#" style="${buttonStyleCss}">Bouton d'action</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: ${formData.footerBackgroundColor || '#F0F0F0'}; padding: 16px 24px;">
              ${formData.footerImageUrl ? `<img src="${formData.footerImageUrl}" alt="Footer" style="height: 40px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;" />` : ''}
              <p style="font-size: 12px; color: #666666; font-family: ${formData.fontFamily || 'Arial, sans-serif'}; margin: 0 0 8px 0;">
                ${formData.footerText || `&copy; ${new Date().getFullYear()} ${formData.clubName || 'Club'}`}
              </p>
              ${socialLinks.length > 0 ? `<p style="margin: 0;">${socialLinks.join(' | ')}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  };

  // Generate preview styles
  const previewGradient =
    formData.headerGradient ||
    generateGradient(formData.primaryColor || '#006994', formData.secondaryColor);

  const logoStyles = generateLogoStyles(formData as BrandingPreset);
  const buttonStyles = generateButtonStyles(formData as BrandingPreset);

  const emailBgStyle = (() => {
    const bgType = formData.emailBackgroundType || 'solid';
    if (bgType === 'gradient' && formData.emailBackgroundGradient) {
      return { background: formData.emailBackgroundGradient };
    }
    if (bgType === 'image' && formData.emailBackgroundImageUrl) {
      return { background: `url(${formData.emailBackgroundImageUrl}) center/cover no-repeat` };
    }
    return { backgroundColor: formData.emailBackgroundColor || '#F5F5F5' };
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
            {isNew ? 'Nouveau style de branding' : `Modifier: ${preset.name}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Column: Form (scrollable) */}
          <div className="w-1/2 overflow-y-auto p-6 space-y-4 border-r border-gray-200 dark:border-dark-border">
            {/* Basic Info Section */}
            <Section title="Informations" icon={Type} defaultOpen={true}>
              <div>
                <label htmlFor="branding-name-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Nom du style *
                </label>
                <input
                  id="branding-name-input"
                  type="text"
                  value={formData.name || ''}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="Ex: Calypso Classic, Nautique..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                />
              </div>

              <div>
                <label htmlFor="branding-description-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Description
                </label>
                <textarea
                  id="branding-description-input"
                  value={formData.description || ''}
                  onChange={e => handleChange('description', e.target.value)}
                  placeholder="Description optionnelle..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                />
              </div>

              <div>
                <label htmlFor="branding-clubName-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Nom du club *
                </label>
                <input
                  id="branding-clubName-input"
                  type="text"
                  value={formData.clubName || ''}
                  onChange={e => handleChange('clubName', e.target.value)}
                  placeholder="Calypso Diving Club"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault || false}
                  onChange={e => handleChange('isDefault', e.target.checked)}
                  className="h-4 w-4 text-calypso-blue rounded border-gray-300 dark:border-dark-border"
                />
                <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-dark-text-primary">
                  Definir comme style par defaut
                </label>
              </div>
            </Section>

            {/* Logo Section */}
            <Section title="Logo" icon={ImageIcon}>
              <div className="flex items-start gap-4">
                {formData.logoUrl ? (
                  <div
                    className="relative border border-gray-200 dark:border-dark-border"
                    style={{
                      ...logoStyles,
                      display: 'inline-block',
                    }}
                  >
                    <img
                      src={formData.logoUrl}
                      alt="Logo"
                      className="h-16 w-auto max-w-[100px] object-contain"
                      style={{ display: 'block' }}
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg flex items-center justify-center border border-dashed border-gray-300 dark:border-dark-border">
                    <ImageIcon className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploading === 'logo'}
                      className="px-3 py-1.5 bg-calypso-blue text-white text-sm rounded-lg hover:bg-calypso-blue-dark disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploading === 'logo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {formData.logoUrl ? 'Changer' : 'Upload'}
                    </button>
                    {formData.logoUrl && (
                      <button
                        onClick={() => handleRemoveImage('logoUrl')}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        aria-label="Supprimer le logo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">PNG ou JPG, max 2MB</p>
                </div>

                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={e => handleImageUpload(e, 'logoUrl', 'logo')}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Logo Style */}
              <div className="space-y-3 pt-2">
                <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  Style d'affichage
                </span>
                <div className="flex gap-2">
                  {(['transparent', 'contained', 'circle'] as LogoStyle[]).map(style => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => handleChange('logoStyle', style)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        formData.logoStyle === style
                          ? 'bg-calypso-blue text-white border-calypso-blue'
                          : 'bg-white dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border hover:border-calypso-blue'
                      )}
                    >
                      {style === 'transparent' && 'Transparent'}
                      {style === 'contained' && 'Cadre'}
                      {style === 'circle' && 'Cercle'}
                    </button>
                  ))}
                </div>

                {formData.logoStyle !== 'transparent' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Fond</label>
                      <ColorPicker
                        value={formData.logoBackgroundColor || '#FFFFFF'}
                        onChange={v => handleChange('logoBackgroundColor', v)}
                        compact
                      />
                    </div>
                    <div>
                      <label htmlFor="branding-logoPadding-input" className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Padding (px)</label>
                      <input
                        id="branding-logoPadding-input"
                        type="number"
                        value={formData.logoPadding ?? 8}
                        onChange={e => handleChange('logoPadding', parseInt(e.target.value) || 0)}
                        min={0}
                        max={32}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary"
                      />
                    </div>
                    {formData.logoStyle === 'contained' && (
                      <div>
                        <label htmlFor="branding-logoBorderRadius-input" className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Arrondi (px)</label>
                        <input
                          id="branding-logoBorderRadius-input"
                          type="number"
                          value={formData.logoBorderRadius ?? 8}
                          onChange={e => handleChange('logoBorderRadius', parseInt(e.target.value) || 0)}
                          min={0}
                          max={32}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-tertiary"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* Colors Section */}
            <Section title="Couleurs" icon={Palette}>
              <ColorPresetSelector onSelect={handleApplyColorPreset} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <ColorPicker
                  label="Principale"
                  value={formData.primaryColor || '#006994'}
                  onChange={v => handleChange('primaryColor', v)}
                />
                <ColorPicker
                  label="Secondaire"
                  value={formData.secondaryColor || '#004A6B'}
                  onChange={v => handleChange('secondaryColor', v)}
                />
                <ColorPicker
                  label="Accent (boutons)"
                  value={formData.accentColor || '#00A5CF'}
                  onChange={v => handleChange('accentColor', v)}
                />
                <ColorPicker
                  label="Texte"
                  value={formData.textColor || '#333333'}
                  onChange={v => handleChange('textColor', v)}
                />
              </div>
            </Section>

            {/* Typography Section */}
            <Section title="Typographie" icon={Type} defaultOpen={false}>
              <div>
                <label htmlFor="branding-fontFamily-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Police
                </label>
                <select
                  id="branding-fontFamily-input"
                  value={formData.fontFamily || 'Arial, sans-serif'}
                  onChange={e => handleChange('fontFamily', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                >
                  {FONT_OPTIONS.map(font => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="branding-titleFontSize-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Taille titres (px)
                  </label>
                  <input
                    id="branding-titleFontSize-input"
                    type="number"
                    value={formData.titleFontSize ?? 24}
                    onChange={e => handleChange('titleFontSize', parseInt(e.target.value) || 24)}
                    min={14}
                    max={48}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
                <div>
                  <label htmlFor="branding-bodyFontSize-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Taille texte (px)
                  </label>
                  <input
                    id="branding-bodyFontSize-input"
                    type="number"
                    value={formData.bodyFontSize ?? 14}
                    onChange={e => handleChange('bodyFontSize', parseInt(e.target.value) || 14)}
                    min={10}
                    max={24}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
              </div>
            </Section>

            {/* Header Section */}
            <Section title="En-tete" icon={Layout} defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="branding-headerHeight-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Hauteur (px)
                  </label>
                  <input
                    id="branding-headerHeight-input"
                    type="number"
                    value={formData.headerHeight ?? 80}
                    onChange={e => handleChange('headerHeight', parseInt(e.target.value) || 80)}
                    min={40}
                    max={200}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
                <div>
                  <label htmlFor="branding-headerPadding-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Padding (px)
                  </label>
                  <input
                    id="branding-headerPadding-input"
                    type="number"
                    value={formData.headerPadding ?? 20}
                    onChange={e => handleChange('headerPadding', parseInt(e.target.value) || 20)}
                    min={0}
                    max={60}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="headerGradientCustom"
                    checked={formData.headerGradientCustom || false}
                    onChange={e => handleChange('headerGradientCustom', e.target.checked)}
                    className="h-4 w-4 text-calypso-blue rounded border-gray-300 dark:border-dark-border"
                  />
                  <label htmlFor="headerGradientCustom" className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Degrade personnalise
                  </label>
                </div>
                {formData.headerGradientCustom && (
                  <input
                    id="branding-headerGradient-input"
                    type="text"
                    value={formData.headerGradient || ''}
                    onChange={e => handleChange('headerGradient', e.target.value)}
                    placeholder="linear-gradient(135deg, #004A6B 0%, #006994 100%)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary font-mono text-sm"
                  />
                )}
              </div>
            </Section>

            {/* Footer Section */}
            <Section title="Pied de page" icon={Square} defaultOpen={false}>
              <div>
                <label htmlFor="branding-footerText-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Texte du footer
                </label>
                <textarea
                  id="branding-footerText-input"
                  value={formData.footerText || ''}
                  onChange={e => handleChange('footerText', e.target.value)}
                  placeholder="© 2025 Club Name. Tous droits reserves."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                />
              </div>

              <ColorPicker
                label="Couleur de fond"
                value={formData.footerBackgroundColor || '#F0F0F0'}
                onChange={v => handleChange('footerBackgroundColor', v)}
              />

              {/* Footer Image */}
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Image footer (optionnel)
                </span>
                <div className="flex items-center gap-3">
                  {formData.footerImageUrl ? (
                    <img
                      src={formData.footerImageUrl}
                      alt="Footer"
                      className="h-12 max-w-[120px] object-contain rounded border border-gray-200 dark:border-dark-border"
                    />
                  ) : (
                    <div className="h-12 w-24 bg-gray-100 dark:bg-dark-bg-tertiary rounded flex items-center justify-center border border-dashed border-gray-300 dark:border-dark-border">
                      <ImageIcon className="h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
                    </div>
                  )}
                  <button
                    onClick={() => footerImageInputRef.current?.click()}
                    disabled={uploading === 'footer'}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading === 'footer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {formData.footerImageUrl ? 'Changer' : 'Upload'}
                  </button>
                  {formData.footerImageUrl && (
                    <button
                      onClick={() => handleRemoveImage('footerImageUrl')}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      aria-label="Supprimer l'image de pied de page"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={footerImageInputRef}
                  onChange={e => handleImageUpload(e, 'footerImageUrl', 'footer')}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            </Section>

            {/* Links Section */}
            <Section title="Liens et reseaux" icon={Globe} defaultOpen={false}>
              <div>
                <label htmlFor="branding-websiteUrl-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Site web
                </label>
                <input
                  id="branding-websiteUrl-input"
                  type="url"
                  value={formData.websiteUrl || ''}
                  onChange={e => handleChange('websiteUrl', e.target.value)}
                  placeholder="https://www.exemple.be"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="branding-facebookUrl-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1 flex items-center gap-1">
                    <Facebook className="h-4 w-4" /> Facebook
                  </label>
                  <input
                    id="branding-facebookUrl-input"
                    type="url"
                    value={formData.facebookUrl || ''}
                    onChange={e => handleChange('facebookUrl', e.target.value)}
                    placeholder="https://facebook.com/..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
                <div>
                  <label htmlFor="branding-instagramUrl-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1 flex items-center gap-1">
                    <Instagram className="h-4 w-4" /> Instagram
                  </label>
                  <input
                    id="branding-instagramUrl-input"
                    type="url"
                    value={formData.instagramUrl || ''}
                    onChange={e => handleChange('instagramUrl', e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
              </div>
            </Section>

            {/* Email Background Section */}
            <Section title="Fond d'email" icon={Layout} defaultOpen={false}>
              <div className="space-y-3">
                <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  Type de fond
                </span>
                <div className="flex gap-2">
                  {(['solid', 'gradient', 'image'] as EmailBackgroundType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleChange('emailBackgroundType', type)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                        formData.emailBackgroundType === type
                          ? 'bg-calypso-blue text-white border-calypso-blue'
                          : 'bg-white dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border hover:border-calypso-blue'
                      )}
                    >
                      {type === 'solid' && 'Couleur unie'}
                      {type === 'gradient' && 'Degrade'}
                      {type === 'image' && 'Image'}
                    </button>
                  ))}
                </div>
              </div>

              {formData.emailBackgroundType === 'solid' && (
                <ColorPicker
                  label="Couleur de fond"
                  value={formData.emailBackgroundColor || '#F5F5F5'}
                  onChange={v => handleChange('emailBackgroundColor', v)}
                />
              )}

              {formData.emailBackgroundType === 'gradient' && (
                <div>
                  <label htmlFor="branding-emailBackgroundGradient-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    CSS Gradient
                  </label>
                  <input
                    id="branding-emailBackgroundGradient-input"
                    type="text"
                    value={formData.emailBackgroundGradient || ''}
                    onChange={e => handleChange('emailBackgroundGradient', e.target.value)}
                    placeholder="linear-gradient(180deg, #F5F5F5 0%, #FFFFFF 100%)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary font-mono text-sm"
                  />
                </div>
              )}

              {formData.emailBackgroundType === 'image' && (
                <div>
                  <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Image de fond
                  </span>
                  <div className="flex items-center gap-3">
                    {formData.emailBackgroundImageUrl ? (
                      <img
                        src={formData.emailBackgroundImageUrl}
                        alt="Background"
                        className="h-16 w-24 object-cover rounded border border-gray-200 dark:border-dark-border"
                      />
                    ) : (
                      <div className="h-16 w-24 bg-gray-100 dark:bg-dark-bg-tertiary rounded flex items-center justify-center border border-dashed border-gray-300 dark:border-dark-border">
                        <ImageIcon className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
                      </div>
                    )}
                    <button
                      onClick={() => bgImageInputRef.current?.click()}
                      disabled={uploading === 'background'}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploading === 'background' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Upload
                    </button>
                    {formData.emailBackgroundImageUrl && (
                      <button
                        onClick={() => handleRemoveImage('emailBackgroundImageUrl')}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        aria-label="Supprimer l'image d'arrière-plan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={bgImageInputRef}
                    onChange={e => handleImageUpload(e, 'emailBackgroundImageUrl', 'background')}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}

              <ColorPicker
                label="Fond du contenu"
                value={formData.contentBackgroundColor || '#FFFFFF'}
                onChange={v => handleChange('contentBackgroundColor', v)}
              />
            </Section>

            {/* Buttons Section */}
            <Section title="Boutons" icon={Square} defaultOpen={false}>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="branding-buttonBorderRadius-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Arrondi (px)
                  </label>
                  <input
                    id="branding-buttonBorderRadius-input"
                    type="number"
                    value={formData.buttonBorderRadius ?? 4}
                    onChange={e => handleChange('buttonBorderRadius', parseInt(e.target.value) || 0)}
                    min={0}
                    max={32}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
                <div>
                  <label htmlFor="branding-buttonPaddingV-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Padding V (px)
                  </label>
                  <input
                    id="branding-buttonPaddingV-input"
                    type="number"
                    value={formData.buttonPaddingV ?? 12}
                    onChange={e => handleChange('buttonPaddingV', parseInt(e.target.value) || 12)}
                    min={4}
                    max={32}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
                <div>
                  <label htmlFor="branding-buttonPaddingH-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Padding H (px)
                  </label>
                  <input
                    id="branding-buttonPaddingH-input"
                    type="number"
                    value={formData.buttonPaddingH ?? 24}
                    onChange={e => handleChange('buttonPaddingH', parseInt(e.target.value) || 24)}
                    min={8}
                    max={64}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary"
                  />
                </div>
              </div>

              {/* Button preview */}
              <div className="pt-2">
                <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-2">Apercu du bouton:</label>
                <button style={buttonStyles} className="cursor-default">
                  Bouton d'action
                </button>
              </div>
            </Section>
          </div>

          {/* Right Column: Preview/Code */}
          <div className="w-1/2 p-6 bg-gray-50 dark:bg-dark-bg-tertiary overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              {/* Tabs */}
              <div className="flex gap-1 bg-gray-200 dark:bg-dark-bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
                    activeTab === 'preview'
                      ? 'bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm'
                      : 'text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary'
                  )}
                >
                  <Eye className="h-4 w-4" />
                  Apercu
                </button>
                <button
                  onClick={() => {
                    setActiveTab('code');
                    if (!htmlCode) {
                      setHtmlCode(generatePreviewHtml());
                    }
                  }}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
                    activeTab === 'code'
                      ? 'bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm'
                      : 'text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary'
                  )}
                >
                  <Code className="h-4 w-4" />
                  Code
                </button>
                <button
                  onClick={handleRenderTab}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
                    activeTab === 'render'
                      ? 'bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary shadow-sm'
                      : 'text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary'
                  )}
                >
                  <Layout className="h-4 w-4" />
                  Rendu HTML
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {activeTab === 'code' && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(htmlCode);
                      toast.success('Code copie!');
                    }}
                    className="px-3 py-1.5 text-sm text-calypso-blue hover:bg-calypso-blue/10 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Copier
                  </button>
                )}
                <button
                  onClick={handleRefreshPreview}
                  className="px-3 py-1.5 text-sm text-calypso-blue hover:bg-calypso-blue/10 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualiser
                </button>
              </div>
            </div>

            {/* Content based on active tab */}
            {activeTab === 'preview' && (
              /* Email Preview - React-based from branding settings */
              <div
                key={previewKey}
                className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-dark-border"
                style={emailBgStyle}
              >
                <div className="max-w-full md:max-w-[600px] mx-auto">
                  {/* Header */}
                  <div
                    className="flex items-center justify-center"
                    style={{
                      background: previewGradient,
                      minHeight: `${formData.headerHeight || 80}px`,
                      padding: `${formData.headerPadding || 20}px`,
                    }}
                  >
                    {formData.logoUrl ? (
                      <div style={logoStyles}>
                        <img
                          src={formData.logoUrl}
                          alt="Logo"
                          className="max-h-14 max-w-[150px] object-contain"
                          style={{ display: 'block' }}
                        />
                      </div>
                    ) : (
                      <h2
                        className="text-xl font-bold text-white"
                        style={{ fontFamily: formData.fontFamily }}
                      >
                        {formData.clubName || 'Nom du Club'}
                      </h2>
                    )}
                  </div>

                  {/* Body */}
                  <div
                    className="p-6"
                    style={{
                      backgroundColor: formData.contentBackgroundColor || '#FFFFFF',
                      fontFamily: formData.fontFamily || 'Arial, sans-serif',
                    }}
                  >
                    <h3
                      className="font-semibold mb-2"
                      style={{
                        fontSize: `${formData.titleFontSize || 24}px`,
                        color: formData.textColor || '#333333',
                      }}
                    >
                      Bienvenue chez {formData.clubName || 'Nom du Club'}
                    </h3>
                    <p
                      className="mb-4"
                      style={{
                        fontSize: `${formData.bodyFontSize || 14}px`,
                        color: formData.textColor || '#333333',
                      }}
                    >
                      Ceci est un apercu de l'apparence de vos emails avec ce style de branding.
                      Les couleurs, typographie et logo seront appliques a toutes les communications.
                    </p>
                    <button style={buttonStyles}>
                      Bouton d'action
                    </button>
                  </div>

                  {/* Footer */}
                  <div
                    className="px-6 py-4 text-center"
                    style={{ backgroundColor: formData.footerBackgroundColor || '#F0F0F0' }}
                  >
                    {formData.footerImageUrl && (
                      <img
                        src={formData.footerImageUrl}
                        alt="Footer"
                        className="h-10 mx-auto mb-2 object-contain"
                      />
                    )}
                    <p
                      className="text-sm text-gray-500 dark:text-dark-text-muted"
                      style={{ fontFamily: formData.fontFamily }}
                    >
                      {formData.footerText || `© ${new Date().getFullYear()} ${formData.clubName || 'Club'}`}
                    </p>
                    {/* Social links */}
                    {(formData.websiteUrl || formData.facebookUrl || formData.instagramUrl) && (
                      <div className="flex justify-center gap-4 mt-2">
                        {formData.websiteUrl && (
                          <span style={{ color: formData.primaryColor }} className="text-sm hover:underline">
                            <Globe className="h-4 w-4 inline mr-1" />
                            Site web
                          </span>
                        )}
                        {formData.facebookUrl && (
                          <span style={{ color: formData.primaryColor }} className="text-sm hover:underline">
                            <Facebook className="h-4 w-4 inline mr-1" />
                            Facebook
                          </span>
                        )}
                        {formData.instagramUrl && (
                          <span style={{ color: formData.primaryColor }} className="text-sm hover:underline">
                            <Instagram className="h-4 w-4 inline mr-1" />
                            Instagram
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'code' && (
              /* Code Editor */
              <div className="h-full">
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">
                  Modifiez le HTML ci-dessous puis cliquez sur "Rendu HTML" pour voir le resultat.
                </p>
                <textarea
                  value={htmlCode}
                  onChange={(e) => setHtmlCode(e.target.value)}
                  className="w-full h-[calc(100vh-320px)] min-h-[400px] p-4 font-mono text-sm border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary resize-none"
                  spellCheck={false}
                  placeholder="Le code HTML de l'email apparaitra ici. Vous pouvez le modifier ou coller votre propre HTML..."
                />
              </div>
            )}

            {activeTab === 'render' && (
              /* Live HTML Render - iframe for custom HTML */
              <div className="h-full">
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mb-2">
                  Rendu du code HTML. Collez votre code dans l'onglet "Code" puis revenez ici pour voir le resultat.
                </p>
                <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-dark-border bg-white h-[calc(100vh-320px)] min-h-[400px]">
                  <iframe
                    ref={iframeRef}
                    srcDoc={htmlCode}
                    title="Email Preview"
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? 'Creer' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}
