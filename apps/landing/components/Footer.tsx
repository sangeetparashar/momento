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
          {/* Left — Logo + wordmark */}
          <div className="flex items-center gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 32V10L13 20L20 12L27 20L36 10V32" stroke="#00FF88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <circle cx="36" cy="10" r="2.5" fill="#00FF88"/>
            </svg>
            <span className="text-white text-[10px] font-mono tracking-[0.2em] uppercase">
              Momento
            </span>
          </div>

          {/* Center — Legal + social */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowPrivacy(true)}
              className="text-[#444444] text-[10px] font-mono uppercase tracking-wider hover:text-white transition-colors duration-200"
            >
              Privacy
            </button>
            <button
              onClick={() => setShowTerms(true)}
              className="text-[#444444] text-[10px] font-mono uppercase tracking-wider hover:text-white transition-colors duration-200"
            >
              Terms
            </button>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#333333] hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>

          {/* Right — Copyright */}
          <p className="text-[10px] text-[#333333] font-mono uppercase tracking-wider">
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
