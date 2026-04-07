/**
 * Club Branding Library
 * Bibliotheque de ressources de branding pour le club
 *
 * Architecture:
 * - clubs/{clubId}/branding (document principal)
 * - clubs/{clubId}/branding/logos/{logoId}
 * - clubs/{clubId}/branding/palettes/{paletteId}
 * - clubs/{clubId}/branding/images/{imageId}
 * - clubs/{clubId}/branding/templates/{templateId}
 */

import type { CSSProperties } from 'react';

// ============================================
// TYPES DE BASE
// ============================================

export type LogoType = 'primary' | 'secondary' | 'icon' | 'monochrome';
export type LogoStyle = 'transparent' | 'contained' | 'circle';
export type ImageType = 'header' | 'footer' | 'background' | 'decoration';

// ============================================
// BRANDING LIBRARY - Document principal
// ============================================

export interface BrandingLibrary {
  // Identite du club
  identity: {
    clubName: string;
    slogan?: string;
    description?: string;
  };

  // Typographie
  typography: {
    fontFamily: string;
    titleFontSize: number;
    bodyFontSize: number;
  };

  // Informations de contact
  contact: {
    websiteUrl?: string;
    facebookUrl?: string;
    instagramUrl?: string;
    email?: string;
    phone?: string;
    address?: string;
  };

  // References aux elements par defaut
  defaultLogoId?: string;
  defaultPaletteId?: string;

  // Metadata
  updatedAt: Date;
  updatedBy?: string;
}

// ============================================
// LOGOS - Sous-collection
// ============================================

export interface BrandingLogo {
  id: string;
  name: string;                    // "Logo principal", "Logo blanc", "Icone"
  url: string;                     // Firebase Storage URL
  type: LogoType;
  style: LogoStyle;
  backgroundColor?: string;        // Pour style 'contained' ou 'circle'
  padding?: number;                // Padding en pixels
  borderRadius?: number;           // Border radius en pixels (pour 'contained')
  createdAt: Date;
}

// ============================================
// PALETTES DE COULEURS - Sous-collection
// ============================================

export interface ColorPalette {
  id: string;
  name: string;                    // "Ocean", "Corporate", "Ete"
  primary: string;                 // Couleur principale
  secondary: string;               // Couleur secondaire
  accent: string;                  // Couleur d'accent (boutons, liens)
  text: string;                    // Couleur du texte
  background: string;              // Fond de l'email
  contentBackground: string;       // Fond du bloc de contenu
  createdAt: Date;
}

// ============================================
// IMAGES / ASSETS - Sous-collection
// ============================================

export interface BrandingImage {
  id: string;
  name: string;                    // "Header vagues", "Footer sponsors"
  url: string;                     // Firebase Storage URL
  type: ImageType;
  description?: string;
  createdAt: Date;
}

// ============================================
// TEMPLATES HTML - Sous-collection
// ============================================

export interface HtmlTemplate {
  id: string;
  name: string;                    // "Ocean Waves", "Minimaliste"
  html: string;                    // Code HTML complet
  description?: string;
  previewUrl?: string;             // Thumbnail/screenshot
  createdAt: Date;
  createdBy: string;
}

// ============================================
// VALEURS PAR DEFAUT
// ============================================

export const DEFAULT_BRANDING_LIBRARY: BrandingLibrary = {
  identity: {
    clubName: 'Calypso Diving Club',
    slogan: '',
    description: '',
  },
  typography: {
    fontFamily: 'Arial, sans-serif',
    titleFontSize: 24,
    bodyFontSize: 14,
  },
  contact: {},
  updatedAt: new Date(),
};

export const DEFAULT_LOGO: Omit<BrandingLogo, 'id' | 'createdAt'> = {
  name: 'Nouveau logo',
  url: '',
  type: 'primary',
  style: 'contained',
  backgroundColor: '#FFFFFF',
  padding: 8,
  borderRadius: 8,
};

export const DEFAULT_PALETTE: Omit<ColorPalette, 'id' | 'createdAt'> = {
  name: 'Nouvelle palette',
  primary: '#006994',
  secondary: '#004A6B',
  accent: '#00A5CF',
  text: '#333333',
  background: '#F5F5F5',
  contentBackground: '#FFFFFF',
};

export const DEFAULT_IMAGE: Omit<BrandingImage, 'id' | 'createdAt'> = {
  name: 'Nouvelle image',
  url: '',
  type: 'decoration',
  description: '',
};

export const DEFAULT_TEMPLATE: Omit<HtmlTemplate, 'id' | 'createdAt' | 'createdBy'> = {
  name: 'Nouveau template',
  html: '',
  description: '',
};

// ============================================
// PALETTES PREDEFINIES
// ============================================

export const PRESET_PALETTES: Omit<ColorPalette, 'id' | 'createdAt'>[] = [
  {
    name: 'Calypso',
    primary: '#006994',
    secondary: '#004A6B',
    accent: '#00A5CF',
    text: '#333333',
    background: '#F5F5F5',
    contentBackground: '#FFFFFF',
  },
  {
    name: 'Ocean',
    primary: '#0077B6',
    secondary: '#023E8A',
    accent: '#48CAE4',
    text: '#333333',
    background: '#E8F4F8',
    contentBackground: '#FFFFFF',
  },
  {
    name: 'Foret',
    primary: '#2D6A4F',
    secondary: '#1B4332',
    accent: '#52B788',
    text: '#333333',
    background: '#E8F5E9',
    contentBackground: '#FFFFFF',
  },
  {
    name: 'Coucher de soleil',
    primary: '#E76F51',
    secondary: '#9C3D28',
    accent: '#F4A261',
    text: '#333333',
    background: '#FFF3E0',
    contentBackground: '#FFFFFF',
  },
  {
    name: 'Corporate',
    primary: '#1A365D',
    secondary: '#0D1B2A',
    accent: '#3182CE',
    text: '#333333',
    background: '#F0F4F8',
    contentBackground: '#FFFFFF',
  },
  {
    name: 'Violet',
    primary: '#7C3AED',
    secondary: '#5B21B6',
    accent: '#A78BFA',
    text: '#333333',
    background: '#F3E8FF',
    contentBackground: '#FFFFFF',
  },
];

// ============================================
// FONTS DISPONIBLES
// ============================================

export const FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
  { value: '"Courier New", monospace', label: 'Courier New' },
] as const;

// ============================================
// HELPERS
// ============================================

/**
 * Generate gradient from palette colors
 */
export function generateGradient(primary: string, secondary: string): string {
  return `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`;
}

/**
 * Generate CSS styles for logo based on settings
 */
export function generateLogoStyles(logo: BrandingLogo): CSSProperties {
  const bgColor = logo.backgroundColor || '#FFFFFF';
  const padding = logo.padding ?? 8;
  const borderRadius = logo.borderRadius ?? 8;

  switch (logo.style) {
    case 'transparent':
      return {
        background: 'transparent',
        padding: 0,
        borderRadius: 0,
      };
    case 'circle':
      return {
        background: bgColor,
        padding: `${padding}px`,
        borderRadius: '50%',
        overflow: 'hidden',
      };
    case 'contained':
    default:
      return {
        background: bgColor,
        padding: `${padding}px`,
        borderRadius: `${borderRadius}px`,
        overflow: 'hidden',
      };
  }
}

/**
 * Generate inline CSS string for logo (for email HTML)
 */
export function generateLogoStyleString(logo: BrandingLogo): string {
  const bgColor = logo.backgroundColor || '#FFFFFF';
  const padding = logo.padding ?? 8;
  const borderRadius = logo.borderRadius ?? 8;

  switch (logo.style) {
    case 'transparent':
      return 'background: transparent; padding: 0;';
    case 'circle':
      return `background: ${bgColor}; padding: ${padding}px; border-radius: 50%; overflow: hidden;`;
    case 'contained':
    default:
      return `background: ${bgColor}; padding: ${padding}px; border-radius: ${borderRadius}px; overflow: hidden;`;
  }
}

/**
 * Adjust color brightness
 */
export function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Generate button styles based on palette
 */
export function generateButtonStyles(palette: ColorPalette, fontFamily: string = 'Arial, sans-serif'): CSSProperties {
  return {
    backgroundColor: palette.accent,
    color: '#FFFFFF',
    borderRadius: '4px',
    padding: '12px 24px',
    fontFamily,
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
    border: 'none',
    cursor: 'pointer',
  };
}

// ============================================
// LEGACY SUPPORT - Pour compatibilite avec l'ancien systeme
// ============================================

/**
 * @deprecated Use BrandingLibrary instead
 */
export interface ClubBranding {
  logoUrl?: string;
  logoAlt?: string;
  logoStyle?: LogoStyle;
  logoBackgroundColor?: string;
  logoPadding?: number;
  logoBorderRadius?: number;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  headerGradient?: string;
  headerGradientCustom?: boolean;
  headerHeight?: number;
  headerPadding?: number;
  fontFamily?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
  clubName: string;
  footerText?: string;
  websiteUrl?: string;
  footerImageUrl?: string;
  footerBackgroundColor?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  emailBackgroundType?: 'solid' | 'gradient' | 'image';
  emailBackgroundColor?: string;
  emailBackgroundGradient?: string;
  emailBackgroundImageUrl?: string;
  contentBackgroundColor?: string;
  buttonBorderRadius?: number;
  buttonPaddingV?: number;
  buttonPaddingH?: number;
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * @deprecated Use BrandingLibrary with sub-collections instead
 */
export interface BrandingPreset extends ClubBranding {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  createdAt: Date;
  createdBy: string;
}

/**
 * @deprecated Use DEFAULT_BRANDING_LIBRARY instead
 */
export const DEFAULT_BRANDING: ClubBranding = {
  primaryColor: '#006994',
  secondaryColor: '#004A6B',
  accentColor: '#00A5CF',
  textColor: '#333333',
  headerGradient: 'linear-gradient(135deg, #004A6B 0%, #006994 100%)',
  headerGradientCustom: false,
  headerHeight: 80,
  headerPadding: 20,
  fontFamily: 'Arial, sans-serif',
  titleFontSize: 24,
  bodyFontSize: 14,
  clubName: 'Calypso Diving Club',
  logoStyle: 'contained',
  logoBackgroundColor: '#FFFFFF',
  logoPadding: 8,
  logoBorderRadius: 8,
  footerBackgroundColor: '#F0F0F0',
  emailBackgroundType: 'solid',
  emailBackgroundColor: '#F5F5F5',
  contentBackgroundColor: '#FFFFFF',
  buttonBorderRadius: 4,
  buttonPaddingV: 12,
  buttonPaddingH: 24,
  updatedAt: new Date(),
};

/**
 * @deprecated
 */
export const DEFAULT_BRANDING_PRESET: Omit<BrandingPreset, 'id' | 'createdAt' | 'createdBy'> = {
  ...DEFAULT_BRANDING,
  name: 'Nouveau style',
  description: '',
  isDefault: false,
};

/**
 * @deprecated Use PRESET_PALETTES instead
 */
export const COLOR_PRESETS = {
  calypso: { name: 'Calypso', primary: '#006994', secondary: '#004A6B', accent: '#00A5CF' },
  ocean: { name: 'Ocean', primary: '#0077B6', secondary: '#023E8A', accent: '#48CAE4' },
  forest: { name: 'Foret', primary: '#2D6A4F', secondary: '#1B4332', accent: '#52B788' },
  sunset: { name: 'Coucher de soleil', primary: '#E76F51', secondary: '#9C3D28', accent: '#F4A261' },
  corporate: { name: 'Corporate', primary: '#1A365D', secondary: '#0D1B2A', accent: '#3182CE' },
  purple: { name: 'Violet', primary: '#7C3AED', secondary: '#5B21B6', accent: '#A78BFA' },
} as const;

export type ColorPresetKey = keyof typeof COLOR_PRESETS;

/**
 * @deprecated
 */
export function generateEmailBackgroundStyle(branding: ClubBranding): string {
  const bgType = branding.emailBackgroundType || 'solid';
  const bgColor = branding.emailBackgroundColor || '#F5F5F5';

  switch (bgType) {
    case 'gradient':
      return branding.emailBackgroundGradient || `linear-gradient(180deg, ${bgColor} 0%, #FFFFFF 100%)`;
    case 'image':
      if (branding.emailBackgroundImageUrl) {
        return `url(${branding.emailBackgroundImageUrl}) center/cover no-repeat`;
      }
      return bgColor;
    case 'solid':
    default:
      return bgColor;
  }
}
