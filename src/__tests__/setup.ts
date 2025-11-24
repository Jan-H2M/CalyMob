/**
 * Jest Test Setup
 *
 * Configuration globale pour tous les tests Jest
 */

import '@testing-library/jest-dom';

// Mock Firebase (évite les erreurs de connexion pendant les tests)
jest.mock('@/lib/firebase', () => ({
  db: {
    collection: jest.fn(),
    doc: jest.fn(),
  },
  storage: {
    ref: jest.fn(),
  },
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
}));

// Mock Firestore functions
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  Timestamp: {
    now: jest.fn(() => ({ toDate: () => new Date('2025-01-15') })),
    fromDate: jest.fn((date) => ({ toDate: () => date })),
  },
  serverTimestamp: jest.fn(),
}));

// Mock Storage functions
jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/photo.jpg')),
  deleteObject: jest.fn(),
}));

// Supprime les warnings console pendant les tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock window.matchMedia (pour Tailwind/responsive tests)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock navigator.mediaDevices (pour tests de caméra)
Object.defineProperty(window.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn(() => Promise.resolve({
      getTracks: () => [{ stop: jest.fn() }],
    })),
  },
});
