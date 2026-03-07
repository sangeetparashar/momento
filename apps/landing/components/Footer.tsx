'use client';

import { useState } from 'react';
import Image from 'next/image';
import Modal from './Modal';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <>
      <footer className="border-t border-momento-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-white.svg"
              alt="Momento"
              width={24}
              height={24}
            />
            <div className="text-center sm:text-left">
              <span className="text-white font-extrabold text-lg tracking-[5px] uppercase">
                MOMENTO
              </span>
              <p className="text-momento-text-tertiary text-sm mt-1">
                The Stock Market for Culture
              </p>
            </div>
          </div>

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

          <p className="text-momento-text-tertiary text-sm">
            &copy; 2026 Momento Inc. All rights reserved.
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
