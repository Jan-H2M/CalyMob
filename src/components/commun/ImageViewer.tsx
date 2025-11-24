import React, { useState } from 'react';
import { Download, Image as ImageIcon, AlertCircle, Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImageViewerProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
}

export function ImageViewer({ fileUrl, fileName, className = '' }: ImageViewerProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);

  const handleImageLoad = () => {
    setIsLoading(false);
    setLoadError(null);
  };

  const handleImageError = () => {
    setLoadError('Impossible de charger l\'image');
    setIsLoading(false);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'image.jpg';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Si erreur de chargement, afficher fallback
  if (loadError) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
            Impossible d'afficher l'image
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
            Cette image ne peut pas être affichée. Vous pouvez la télécharger pour la consulter.
          </p>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors mx-auto"
          >
            <Download className="h-4 w-4" />
            Télécharger l'image
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Contrôles */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-white" />
          <span className="text-white text-sm">
            {fileName || 'Image'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Rotation */}
          <button
            onClick={handleRotate}
            className="p-1.5 text-white hover:bg-gray-700 rounded"
            title="Rotation 90°"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Zoom controls */}
          <button
            onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))}
            disabled={scale <= 0.5}
            className="p-1.5 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom arrière"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-white text-sm font-mono min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(prev => Math.min(3.0, prev + 0.25))}
            disabled={scale >= 3.0}
            className="p-1.5 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom avant"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {/* Download button */}
          <div className="w-px h-6 bg-gray-600 mx-2" />
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 bg-calypso-blue text-white rounded hover:bg-calypso-blue-dark transition-colors text-sm"
            title="Télécharger l'image"
          >
            <Download className="h-4 w-4" />
            Télécharger
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 overflow-auto bg-gray-900 rounded-b-lg flex items-center justify-center p-4">
        {isLoading && (
          <div className="absolute flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-white text-sm">Chargement de l'image...</p>
          </div>
        )}

        <img
          src={fileUrl}
          alt={fileName || 'Document'}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className="max-w-full max-h-full object-contain shadow-lg transition-transform"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            display: isLoading ? 'none' : 'block'
          }}
        />
      </div>
    </div>
  );
}
