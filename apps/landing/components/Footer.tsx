'use client';

import { useState } from 'react';
import Modal from './Modal';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <>
      <footer className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto py-8 px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left — Logo + tagline */}
          <div className="flex items-center gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
            </svg>
            <span className="text-white font-medium text-sm tracking-[0.3em] uppercase">
              MOMENTO
            </span>
          </div>

          {/* Center — Legal links */}
          <div className="flex items-center gap-6 text-sm text-[#444444]">
            <button
              onClick={() => setShowPrivacy(true)}
              className="hover:text-white transition-colors duration-200"
            >
              Privacy
            </button>
            <button
              onClick={() => setShowTerms(true)}
              className="hover:text-white transition-colors duration-200"
            >
              Terms
            </button>
            <span className="font-mono text-xs text-[#333333]">Solana-powered</span>
          </div>

          {/* Right — Copyright */}
          <p className="text-sm text-[#333333] font-mono">
            &copy; 2026 Momento
          </p>
        </div>
      </footer>

      <Modal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms of Service"
      >
        <TermsContent />
      </Modal>

      <Modal
        isOpen={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        title="Privacy Policy"
      >
        <PrivacyContent />
      </Modal>
    </>
  );
}
