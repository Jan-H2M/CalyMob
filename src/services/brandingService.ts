import { logger } from '@/utils/logger';
import { db, storage } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  BrandingLibrary,
  BrandingLogo,
  ColorPalette,
  BrandingImage,
  HtmlTemplate,
  DEFAULT_BRANDING_LIBRARY,
  DEFAULT_LOGO,
  DEFAULT_PALETTE,
  DEFAULT_IMAGE,
  DEFAULT_TEMPLATE,
  // Legacy imports for backward compatibility
  ClubBranding,
  BrandingPreset,
  DEFAULT_BRANDING,
  DEFAULT_BRANDING_PRESET,
} from '@/types/branding';

/**
 * Service for managing club branding library
 *
 * New architecture:
 * - clubs/{clubId}/branding (main document)
 * - clubs/{clubId}/branding/logos/{logoId}
 * - clubs/{clubId}/branding/palettes/{paletteId}
 * - clubs/{clubId}/branding/images/{imageId}
 * - clubs/{clubId}/branding/templates/{templateId}
 *
 * Legacy paths (for backward compatibility):
 * - clubs/{clubId}/settings/branding
 * - clubs/{clubId}/brandings/{brandingId}
 */
export class BrandingService {
  // ============================================================================
  // BRANDING LIBRARY - Main document
  // ============================================================================

  /**
   * Get the main branding library document reference
   */
  private static getBrandingLibraryRef(clubId: string) {
    return doc(db, 'clubs', clubId, 'branding', 'library');
  }

  /**
   * Load the branding library for a club
   */
  static async loadBrandingLibrary(clubId: string): Promise<BrandingLibrary> {
    try {
      const docRef = this.getBrandingLibraryRef(clubId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...DEFAULT_BRANDING_LIBRARY,
          ...data,
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as BrandingLibrary;
      }

      logger.debug('📎 No branding library found, using defaults');
      return DEFAULT_BRANDING_LIBRARY;
    } catch (error) {
      logger.error('❌ Error loading branding library:', error);
      return DEFAULT_BRANDING_LIBRARY;
    }
  }

  /**
   * Save the branding library
   */
  static async saveBrandingLibrary(
    clubId: string,
    library: Partial<BrandingLibrary>,
    userId?: string
  ): Promise<void> {
    try {
      const docRef = this.getBrandingLibraryRef(clubId);
      const dataToSave: Record<string, unknown> = {
        ...library,
        updatedAt: serverTimestamp(),
      };
      if (userId) {
        dataToSave.updatedBy = userId;
      }
      await setDoc(docRef, dataToSave, { merge: true });
      logger.debug('✅ Branding library saved');
    } catch (error) {
      logger.error('❌ Error saving branding library:', error);
      throw error;
    }
  }

  // ============================================================================
  // LOGOS - Sub-collection
  // ============================================================================

  private static getLogosCollectionRef(clubId: string) {
    return collection(db, 'clubs', clubId, 'branding', 'library', 'logos');
  }

  private static getLogoRef(clubId: string, logoId: string) {
    return doc(db, 'clubs', clubId, 'branding', 'library', 'logos', logoId);
  }

  /**
   * Load all logos for a club
   */
  static async loadLogos(clubId: string): Promise<BrandingLogo[]> {
    try {
      const collectionRef = this.getLogosCollectionRef(clubId);
      const snapshot = await getDocs(collectionRef);

      const logos: BrandingLogo[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...DEFAULT_LOGO,
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as BrandingLogo;
      });

      // Sort: primary first, then by name
      logos.sort((a, b) => {
        if (a.type === 'primary' && b.type !== 'primary') return -1;
        if (a.type !== 'primary' && b.type === 'primary') return 1;
        return a.name.localeCompare(b.name);
      });

      logger.debug(`📎 Loaded ${logos.length} logos`);
      return logos;
    } catch (error) {
      logger.error('❌ Error loading logos:', error);
      return [];
    }
  }

  /**
   * Load a single logo by ID
   */
  static async loadLogo(clubId: string, logoId: string): Promise<BrandingLogo | null> {
    try {
      const docRef = this.getLogoRef(clubId, logoId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      const data = docSnap.data();
      return {
        ...DEFAULT_LOGO,
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as BrandingLogo;
    } catch (error) {
      logger.error('❌ Error loading logo:', error);
      return null;
    }
  }

  /**
   * Create a new logo
   */
  static async createLogo(
    clubId: string,
    logo: Omit<BrandingLogo, 'id' | 'createdAt'>
  ): Promise<string> {
    try {
      const collectionRef = this.getLogosCollectionRef(clubId);
      const docRef = await addDoc(collectionRef, {
        ...logo,
        createdAt: serverTimestamp(),
      });
      logger.debug('✅ Logo created:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating logo:', error);
      throw error;
    }
  }

  /**
   * Update an existing logo
   */
  static async updateLogo(
    clubId: string,
    logoId: string,
    updates: Partial<BrandingLogo>
  ): Promise<void> {
    try {
      const docRef = this.getLogoRef(clubId, logoId);
      const { id, createdAt, ...dataToUpdate } = updates as BrandingLogo;
      await updateDoc(docRef, dataToUpdate);
      logger.debug('✅ Logo updated:', logoId);
    } catch (error) {
      logger.error('❌ Error updating logo:', error);
      throw error;
    }
  }

  /**
   * Delete a logo
   */
  static async deleteLogo(clubId: string, logoId: string, logoUrl?: string): Promise<void> {
    try {
      // Delete from storage if URL exists
      if (logoUrl) {
        await this.deleteFileFromStorage(logoUrl);
      }

      // Delete document
      const docRef = this.getLogoRef(clubId, logoId);
      await deleteDoc(docRef);

      // If this was the default logo, clear the reference
      const library = await this.loadBrandingLibrary(clubId);
      if (library.defaultLogoId === logoId) {
        await this.saveBrandingLibrary(clubId, { defaultLogoId: undefined });
      }

      logger.debug('✅ Logo deleted:', logoId);
    } catch (error) {
      logger.error('❌ Error deleting logo:', error);
      throw error;
    }
  }

  /**
   * Upload a logo image file
   */
  static async uploadLogoFile(clubId: string, logoId: string, file: File): Promise<string> {
    try {
      this.validateImageFile(file, 2);

      const extension = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `clubs/${clubId}/branding/logos/${logoId}_${timestamp}.${extension}`
      );

      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update logo with new URL
      await this.updateLogo(clubId, logoId, { url: downloadURL });

      logger.debug('✅ Logo file uploaded:', downloadURL);
      return downloadURL;
    } catch (error) {
      logger.error('❌ Error uploading logo file:', error);
      throw error;
    }
  }

  // ============================================================================
  // PALETTES - Sub-collection
  // ============================================================================

  private static getPalettesCollectionRef(clubId: string) {
    return collection(db, 'clubs', clubId, 'branding', 'library', 'palettes');
  }

  private static getPaletteRef(clubId: string, paletteId: string) {
    return doc(db, 'clubs', clubId, 'branding', 'library', 'palettes', paletteId);
  }

  /**
   * Load all color palettes for a club
   */
  static async loadPalettes(clubId: string): Promise<ColorPalette[]> {
    try {
      const collectionRef = this.getPalettesCollectionRef(clubId);
      const snapshot = await getDocs(collectionRef);

      const palettes: ColorPalette[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...DEFAULT_PALETTE,
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as ColorPalette;
      });

      // Sort by name
      palettes.sort((a, b) => a.name.localeCompare(b.name));

      logger.debug(`📎 Loaded ${palettes.length} palettes`);
      return palettes;
    } catch (error) {
      logger.error('❌ Error loading palettes:', error);
      return [];
    }
  }

  /**
   * Load a single palette by ID
   */
  static async loadPalette(clubId: string, paletteId: string): Promise<ColorPalette | null> {
    try {
      const docRef = this.getPaletteRef(clubId, paletteId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      const data = docSnap.data();
      return {
        ...DEFAULT_PALETTE,
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as ColorPalette;
    } catch (error) {
      logger.error('❌ Error loading palette:', error);
      return null;
    }
  }

  /**
   * Create a new color palette
   */
  static async createPalette(
    clubId: string,
    palette: Omit<ColorPalette, 'id' | 'createdAt'>
  ): Promise<string> {
    try {
      if (!palette.name?.trim()) {
        throw new Error('Le nom de la palette est requis');
      }

      const collectionRef = this.getPalettesCollectionRef(clubId);
      const docRef = await addDoc(collectionRef, {
        ...palette,
        createdAt: serverTimestamp(),
      });
      logger.debug('✅ Palette created:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating palette:', error);
      throw error;
    }
  }

  /**
   * Update an existing palette
   */
  static async updatePalette(
    clubId: string,
    paletteId: string,
    updates: Partial<ColorPalette>
  ): Promise<void> {
    try {
      const docRef = this.getPaletteRef(clubId, paletteId);
      const { id, createdAt, ...dataToUpdate } = updates as ColorPalette;
      await updateDoc(docRef, dataToUpdate);
      logger.debug('✅ Palette updated:', paletteId);
    } catch (error) {
      logger.error('❌ Error updating palette:', error);
      throw error;
    }
  }

  /**
   * Delete a palette
   */
  static async deletePalette(clubId: string, paletteId: string): Promise<void> {
    try {
      const docRef = this.getPaletteRef(clubId, paletteId);
      await deleteDoc(docRef);

      // If this was the default palette, clear the reference
      const library = await this.loadBrandingLibrary(clubId);
      if (library.defaultPaletteId === paletteId) {
        await this.saveBrandingLibrary(clubId, { defaultPaletteId: undefined });
      }

      logger.debug('✅ Palette deleted:', paletteId);
    } catch (error) {
      logger.error('❌ Error deleting palette:', error);
      throw error;
    }
  }

  // ============================================================================
  // IMAGES - Sub-collection
  // ============================================================================

  private static getImagesCollectionRef(clubId: string) {
    return collection(db, 'clubs', clubId, 'branding', 'library', 'images');
  }

  private static getImageRef(clubId: string, imageId: string) {
    return doc(db, 'clubs', clubId, 'branding', 'library', 'images', imageId);
  }

  /**
   * Load all images for a club
   */
  static async loadImages(clubId: string): Promise<BrandingImage[]> {
    try {
      const collectionRef = this.getImagesCollectionRef(clubId);
      const snapshot = await getDocs(collectionRef);

      const images: BrandingImage[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...DEFAULT_IMAGE,
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as BrandingImage;
      });

      // Sort by type, then by name
      const typeOrder = { header: 0, footer: 1, background: 2, decoration: 3 };
      images.sort((a, b) => {
        const orderA = typeOrder[a.type] ?? 4;
        const orderB = typeOrder[b.type] ?? 4;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

      logger.debug(`📎 Loaded ${images.length} images`);
      return images;
    } catch (error) {
      logger.error('❌ Error loading images:', error);
      return [];
    }
  }

  /**
   * Load a single image by ID
   */
  static async loadImage(clubId: string, imageId: string): Promise<BrandingImage | null> {
    try {
      const docRef = this.getImageRef(clubId, imageId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      const data = docSnap.data();
      return {
        ...DEFAULT_IMAGE,
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as BrandingImage;
    } catch (error) {
      logger.error('❌ Error loading image:', error);
      return null;
    }
  }

  /**
   * Create a new image
   */
  static async createImage(
    clubId: string,
    image: Omit<BrandingImage, 'id' | 'createdAt'>
  ): Promise<string> {
    try {
      if (!image.name?.trim()) {
        throw new Error("Le nom de l'image est requis");
      }

      const collectionRef = this.getImagesCollectionRef(clubId);
      const docRef = await addDoc(collectionRef, {
        ...image,
        createdAt: serverTimestamp(),
      });
      logger.debug('✅ Image created:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating image:', error);
      throw error;
    }
  }

  /**
   * Update an existing image
   */
  static async updateImage(
    clubId: string,
    imageId: string,
    updates: Partial<BrandingImage>
  ): Promise<void> {
    try {
      const docRef = this.getImageRef(clubId, imageId);
      const { id, createdAt, ...dataToUpdate } = updates as BrandingImage;
      await updateDoc(docRef, dataToUpdate);
      logger.debug('✅ Image updated:', imageId);
    } catch (error) {
      logger.error('❌ Error updating image:', error);
      throw error;
    }
  }

  /**
   * Delete an image
   */
  static async deleteImage(clubId: string, imageId: string, imageUrl?: string): Promise<void> {
    try {
      // Delete from storage if URL exists
      if (imageUrl) {
        await this.deleteFileFromStorage(imageUrl);
      }

      // Delete document
      const docRef = this.getImageRef(clubId, imageId);
      await deleteDoc(docRef);

      logger.debug('✅ Image deleted:', imageId);
    } catch (error) {
      logger.error('❌ Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Upload an image file
   */
  static async uploadImageFile(clubId: string, imageId: string, file: File): Promise<string> {
    try {
      this.validateImageFile(file, 5); // 5MB for images

      const extension = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `clubs/${clubId}/branding/images/${imageId}_${timestamp}.${extension}`
      );

      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update image with new URL
      await this.updateImage(clubId, imageId, { url: downloadURL });

      logger.debug('✅ Image file uploaded:', downloadURL);
      return downloadURL;
    } catch (error) {
      logger.error('❌ Error uploading image file:', error);
      throw error;
    }
  }

  // ============================================================================
  // TEMPLATES - Sub-collection
  // ============================================================================

  private static getTemplatesCollectionRef(clubId: string) {
    return collection(db, 'clubs', clubId, 'branding', 'library', 'templates');
  }

  private static getTemplateRef(clubId: string, templateId: string) {
    return doc(db, 'clubs', clubId, 'branding', 'library', 'templates', templateId);
  }

  /**
   * Load all HTML templates for a club
   */
  static async loadTemplates(clubId: string): Promise<HtmlTemplate[]> {
    try {
      const collectionRef = this.getTemplatesCollectionRef(clubId);
      const snapshot = await getDocs(collectionRef);

      const templates: HtmlTemplate[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...DEFAULT_TEMPLATE,
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as HtmlTemplate;
      });

      // Sort by name
      templates.sort((a, b) => a.name.localeCompare(b.name));

      logger.debug(`📎 Loaded ${templates.length} templates`);
      return templates;
    } catch (error) {
      logger.error('❌ Error loading templates:', error);
      return [];
    }
  }

  /**
   * Load a single template by ID
   */
  static async loadTemplate(clubId: string, templateId: string): Promise<HtmlTemplate | null> {
    try {
      const docRef = this.getTemplateRef(clubId, templateId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      const data = docSnap.data();
      return {
        ...DEFAULT_TEMPLATE,
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as HtmlTemplate;
    } catch (error) {
      logger.error('❌ Error loading template:', error);
      return null;
    }
  }

  /**
   * Create a new HTML template
   */
  static async createTemplate(
    clubId: string,
    template: Omit<HtmlTemplate, 'id' | 'createdAt'>,
    userId: string
  ): Promise<string> {
    try {
      if (!template.name?.trim()) {
        throw new Error('Le nom du template est requis');
      }

      const collectionRef = this.getTemplatesCollectionRef(clubId);
      const docRef = await addDoc(collectionRef, {
        ...template,
        createdBy: userId,
        createdAt: serverTimestamp(),
      });
      logger.debug('✅ Template created:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  static async updateTemplate(
    clubId: string,
    templateId: string,
    updates: Partial<HtmlTemplate>
  ): Promise<void> {
    try {
      const docRef = this.getTemplateRef(clubId, templateId);
      const { id, createdAt, createdBy, ...dataToUpdate } = updates as HtmlTemplate;
      await updateDoc(docRef, dataToUpdate);
      logger.debug('✅ Template updated:', templateId);
    } catch (error) {
      logger.error('❌ Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete a template
   */
  static async deleteTemplate(clubId: string, templateId: string): Promise<void> {
    try {
      const docRef = this.getTemplateRef(clubId, templateId);
      await deleteDoc(docRef);
      logger.debug('✅ Template deleted:', templateId);
    } catch (error) {
      logger.error('❌ Error deleting template:', error);
      throw error;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Validate an image file
   */
  private static validateImageFile(file: File, maxSizeMB: number): void {
    if (!file.type.startsWith('image/')) {
      throw new Error('Seuls les fichiers image sont autorises');
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`La taille du fichier doit etre inferieure a ${maxSizeMB}MB`);
    }
  }

  /**
   * Delete a file from Firebase Storage given its URL
   */
  private static async deleteFileFromStorage(url: string): Promise<void> {
    try {
      const urlPath = new URL(url).pathname;
      const storagePath = decodeURIComponent(urlPath.split('/o/')[1]?.split('?')[0] || '');

      if (storagePath) {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
        logger.debug('✅ File deleted from storage');
      }
    } catch (error) {
      logger.warn('⚠️ Could not delete file from storage:', error);
    }
  }

  /**
   * Load complete branding context for AI email generation
   */
  static async loadBrandingContext(clubId: string): Promise<{
    library: BrandingLibrary;
    logos: BrandingLogo[];
    palettes: ColorPalette[];
    images: BrandingImage[];
    templates: HtmlTemplate[];
    defaultLogo?: BrandingLogo;
    defaultPalette?: ColorPalette;
  }> {
    try {
      const [library, logos, palettes, images, templates] = await Promise.all([
        this.loadBrandingLibrary(clubId),
        this.loadLogos(clubId),
        this.loadPalettes(clubId),
        this.loadImages(clubId),
        this.loadTemplates(clubId),
      ]);

      const defaultLogo = library.defaultLogoId
        ? logos.find(l => l.id === library.defaultLogoId)
        : logos.find(l => l.type === 'primary') || logos[0];

      const defaultPalette = library.defaultPaletteId
        ? palettes.find(p => p.id === library.defaultPaletteId)
        : palettes[0];

      return {
        library,
        logos,
        palettes,
        images,
        templates,
        defaultLogo,
        defaultPalette,
      };
    } catch (error) {
      logger.error('❌ Error loading branding context:', error);
      return {
        library: DEFAULT_BRANDING_LIBRARY,
        logos: [],
        palettes: [],
        images: [],
        templates: [],
      };
    }
  }

  // ============================================================================
  // LEGACY SUPPORT - For backward compatibility
  // ============================================================================

  /**
   * @deprecated Use loadBrandingLibrary instead
   */
  private static getDocRef(clubId: string) {
    return doc(db, 'clubs', clubId, 'settings', 'branding');
  }

  /**
   * @deprecated Use loadBrandingLibrary instead
   */
  static async loadBranding(clubId: string): Promise<ClubBranding> {
    try {
      const docRef = this.getDocRef(clubId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...DEFAULT_BRANDING,
          ...data,
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as ClubBranding;
      }

      return DEFAULT_BRANDING;
    } catch (error) {
      logger.error('❌ Error loading legacy branding:', error);
      return DEFAULT_BRANDING;
    }
  }

  /**
   * @deprecated Use saveBrandingLibrary instead
   */
  static async saveBranding(
    clubId: string,
    branding: Partial<ClubBranding>,
    userId?: string
  ): Promise<void> {
    try {
      const docRef = this.getDocRef(clubId);
      const dataToSave: Record<string, unknown> = {
        ...branding,
        updatedAt: serverTimestamp(),
      };
      if (userId) {
        dataToSave.updatedBy = userId;
      }
      await setDoc(docRef, dataToSave, { merge: true });
      logger.debug('✅ Legacy branding saved');
    } catch (error) {
      logger.error('❌ Error saving legacy branding:', error);
      throw error;
    }
  }

  /**
   * @deprecated Use logo sub-collection instead
   */
  static async uploadLogo(clubId: string, file: File): Promise<string> {
    try {
      this.validateImageFile(file, 2);

      const extension = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `clubs/${clubId}/branding/logo.${extension}`);

      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await this.saveBranding(clubId, { logoUrl: downloadURL });

      logger.debug('✅ Legacy logo uploaded:', downloadURL);
      return downloadURL;
    } catch (error) {
      logger.error('❌ Error uploading legacy logo:', error);
      throw error;
    }
  }

  /**
   * @deprecated
   */
  static validateBranding(branding: Partial<ClubBranding>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!branding.clubName?.trim()) {
      errors.push('Le nom du club est requis');
    }

    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (branding.primaryColor && !colorRegex.test(branding.primaryColor)) {
      errors.push('Format de couleur principale invalide');
    }

    return { valid: errors.length === 0, errors };
  }

  // Legacy branding presets support
  private static getBrandingsCollectionRef(clubId: string) {
    return collection(db, 'clubs', clubId, 'brandings');
  }

  private static getBrandingPresetRef(clubId: string, presetId: string) {
    return doc(db, 'clubs', clubId, 'brandings', presetId);
  }

  /**
   * @deprecated Use loadPalettes/loadLogos/etc instead
   */
  static async loadBrandingPresets(clubId: string): Promise<BrandingPreset[]> {
    try {
      const collectionRef = this.getBrandingsCollectionRef(clubId);
      const snapshot = await getDocs(collectionRef);

      const presets: BrandingPreset[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...DEFAULT_BRANDING_PRESET,
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as BrandingPreset;
      });

      presets.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });

      return presets;
    } catch (error) {
      logger.error('❌ Error loading legacy branding presets:', error);
      return [];
    }
  }

  /**
   * @deprecated
   */
  static async loadBrandingPreset(clubId: string, presetId: string): Promise<BrandingPreset | null> {
    try {
      const docRef = this.getBrandingPresetRef(clubId, presetId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      const data = docSnap.data();
      return {
        ...DEFAULT_BRANDING_PRESET,
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as BrandingPreset;
    } catch (error) {
      logger.error('❌ Error loading legacy branding preset:', error);
      return null;
    }
  }

  /**
   * @deprecated
   */
  static async loadDefaultBrandingPreset(clubId: string): Promise<BrandingPreset | null> {
    try {
      const collectionRef = this.getBrandingsCollectionRef(clubId);
      const q = query(collectionRef, where('isDefault', '==', true));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        const presets = await this.loadBrandingPresets(clubId);
        return presets.length > 0 ? presets[0] : null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        ...DEFAULT_BRANDING_PRESET,
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as BrandingPreset;
    } catch (error) {
      logger.error('❌ Error loading default legacy branding preset:', error);
      return null;
    }
  }

  /**
   * @deprecated Use createPalette/createLogo instead
   */
  static async createBrandingPreset(
    clubId: string,
    preset: Omit<BrandingPreset, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<string> {
    try {
      const collectionRef = this.getBrandingsCollectionRef(clubId);

      if (preset.isDefault) {
        await this.unsetAllDefaults(clubId);
      }

      const docRef = await addDoc(collectionRef, {
        ...preset,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      });

      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating legacy branding preset:', error);
      throw error;
    }
  }

  /**
   * @deprecated
   */
  static async updateBrandingPreset(
    clubId: string,
    presetId: string,
    updates: Partial<BrandingPreset>,
    userId?: string
  ): Promise<void> {
    try {
      const docRef = this.getBrandingPresetRef(clubId, presetId);

      if (updates.isDefault === true) {
        await this.unsetAllDefaults(clubId);
      }

      const dataToUpdate: Record<string, unknown> = {
        ...updates,
        updatedAt: serverTimestamp(),
      };
      delete dataToUpdate.id;

      if (userId) {
        dataToUpdate.updatedBy = userId;
      }

      await updateDoc(docRef, dataToUpdate);
    } catch (error) {
      logger.error('❌ Error updating legacy branding preset:', error);
      throw error;
    }
  }

  /**
   * @deprecated
   */
  static async deleteBrandingPreset(clubId: string, presetId: string): Promise<void> {
    try {
      const preset = await this.loadBrandingPreset(clubId, presetId);
      if (preset?.isDefault) {
        throw new Error('Impossible de supprimer le style par defaut');
      }

      const docRef = this.getBrandingPresetRef(clubId, presetId);
      await deleteDoc(docRef);
    } catch (error) {
      logger.error('❌ Error deleting legacy branding preset:', error);
      throw error;
    }
  }

  /**
   * @deprecated
   */
  private static async unsetAllDefaults(clubId: string): Promise<void> {
    const collectionRef = this.getBrandingsCollectionRef(clubId);
    const q = query(collectionRef, where('isDefault', '==', true));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });
      await batch.commit();
    }
  }

  /**
   * @deprecated
   */
  static async uploadPresetImage(
    clubId: string,
    presetId: string,
    file: File,
    type: 'logo' | 'footer' | 'background'
  ): Promise<string> {
    try {
      this.validateImageFile(file, type === 'background' ? 5 : 2);

      const extension = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `clubs/${clubId}/brandings/${presetId}/${type}_${timestamp}.${extension}`
      );

      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const updateField: Record<string, string> = {};
      switch (type) {
        case 'logo':
          updateField.logoUrl = downloadURL;
          break;
        case 'footer':
          updateField.footerImageUrl = downloadURL;
          break;
        case 'background':
          updateField.emailBackgroundImageUrl = downloadURL;
          break;
      }

      await this.updateBrandingPreset(clubId, presetId, updateField);

      return downloadURL;
    } catch (error) {
      logger.error(`❌ Error uploading legacy preset ${type} image:`, error);
      throw error;
    }
  }
}
