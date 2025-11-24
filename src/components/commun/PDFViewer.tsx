import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Download, FileText, AlertCircle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
  className?: string;
}

export function PDFViewer({ fileUrl, fileName, className = '' }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setIsLoading(false);
    setLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF Load Error:', error);
    setLoadError(error.message);
    setIsLoading(false);
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'document.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Si erreur de chargement, afficher fallback avec lien de téléchargement
  if (loadError) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
            Impossible d'afficher le PDF
          </h3>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
            Ce PDF ne peut pas être affiché dans le navigateur. Vous pouvez le télécharger pour le consulter.
          </p>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors mx-auto"
          >
            <Download className="h-4 w-4" />
            Télécharger le PDF
          </button>
          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-3">
            Erreur: {loadError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Contrôles */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-white" />
          <span className="text-white text-sm">
            {fileName || 'Document PDF'}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            onClick={() => setScale(prev => Math.min(2.0, prev + 0.25))}
            disabled={scale >= 2.0}
            className="p-1.5 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom avant"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {/* Page navigation */}
          {numPages && numPages > 1 && (
            <>
              <div className="w-px h-6 bg-gray-600 mx-2" />
              <button
                onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                disabled={pageNumber <= 1}
                className="px-3 py-1.5 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ◀
              </button>
              <span className="text-white text-sm">
                Page {pageNumber} / {numPages}
              </span>
              <button
                onClick={() => setPageNumber(prev => Math.min(numPages, prev + 1))}
                disabled={pageNumber >= numPages}
                className="px-3 py-1.5 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                ▶
              </button>
            </>
          )}

          {/* Download button */}
          <div className="w-px h-6 bg-gray-600 mx-2" />
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 bg-calypso-blue text-white rounded hover:bg-calypso-blue-dark transition-colors text-sm"
            title="Télécharger le PDF"
          >
            <Download className="h-4 w-4" />
            Télécharger
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="flex-1 overflow-auto bg-gray-900 rounded-b-lg flex items-center justify-center p-4">
        {isLoading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-white text-sm">Chargement du PDF...</p>
          </div>
        )}

        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          error=""
          className="flex items-center justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  );
}
