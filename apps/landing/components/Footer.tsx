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
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto py-8 px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left — Logo + tagline */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-white.svg"
              alt="Momento"
              width={24}
              height={24}
            />
            <div>
              <span className="text-white font-extrabold text-sm tracking-[4px] uppercase">
                MOMENTO
              </span>
              <p className="text-xs text-momento-text-tertiary">
                The Stock Market for Culture
              </p>
            </div>
          </div>

          {/* Center — Legal links */}
          <div className="flex items-center gap-6 text-sm text-momento-text-tertiary">
            <button
              onClick={() => setShowPrivacy(true)}
              className="hover:text-white transition-colors duration-200"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setShowTerms(true)}
              className="hover:text-white transition-colors duration-200"
            >
              Terms of Service
            </button>
          </div>

          {/* Right — Copyright */}
          <p className="text-sm text-momento-text-tertiary">
            &copy; 2026 Momento Inc.
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
