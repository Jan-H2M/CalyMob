import React from 'react';
import { Outlet } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar';
import { PublicFooter } from './PublicFooter';
import '@/styles/nautical.css';

// Bubble component for animated background
function Bubbles() {
  return (
    <div className="bubbles-container">
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
      <div className="bubble" />
    </div>
  );
}

// Animated wave SVG component
export function WaveDivider({ flip = false, color = '#ffffff' }: { flip?: boolean; color?: string }) {
  return (
    <svg
      className={`w-full h-20 ${flip ? 'rotate-180' : ''}`}
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
    >
      <path
        fill={color}
        d="M0,40 C240,100 480,0 720,50 C960,100 1200,20 1440,60 L1440,100 L0,100 Z"
      >
        <animate
          attributeName="d"
          dur="10s"
          repeatCount="indefinite"
          values="
            M0,40 C240,100 480,0 720,50 C960,100 1200,20 1440,60 L1440,100 L0,100 Z;
            M0,60 C240,20 480,80 720,40 C960,0 1200,80 1440,40 L1440,100 L0,100 Z;
            M0,40 C240,100 480,0 720,50 C960,100 1200,20 1440,60 L1440,100 L0,100 Z
          "
        />
      </path>
    </svg>
  );
}

interface PublicLayoutProps {
  children?: React.ReactNode;
  showBubbles?: boolean;
}

export function PublicLayout({ children, showBubbles = false }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f0f9ff] to-[#e0f2fe]">
      <PublicNavbar />

      <main className="flex-grow relative">
        {showBubbles && <Bubbles />}
        {children || <Outlet />}
      </main>

      <PublicFooter />
    </div>
  );
}
