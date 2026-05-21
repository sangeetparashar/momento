'use client';

import { useState } from 'react';
import Modal from './Modal';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/3cPn24S8';
const TESTFLIGHT_DISPLAY = 'testflight.apple.com/join/3cPn24S8';

interface BetaJoinCTAProps {
  /** Visual style. `primary` is the big filled pill for hero. `compact` is the small navbar button. */
  variant?: 'primary' | 'compact';
  /** Optional override label. Defaults to "Join the Beta" / "Join Beta" per variant. */
  label?: string;
}

export default function BetaJoinCTA({
  variant = 'primary',
  label,
}: BetaJoinCTAProps) {
  const [open, setOpen] = useState(false);

  const isPrimary = variant === 'primary';
  const buttonText = label ?? (isPrimary ? 'Join the Beta' : 'Join Beta');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          isPrimary
            ? `group inline-flex items-center gap-2 px-7 md:px-9 py-3 md:py-3.5 rounded-full
               bg-momento-primary text-black
               font-mono text-xs md:text-sm uppercase tracking-[0.15em] font-bold
               hover:bg-momento-accent hover:shadow-[0_0_30px_rgba(0,255,136,0.4)]
               active:scale-[0.98] transition-all duration-200 whitespace-nowrap`
            : `px-5 py-2 rounded-full bg-momento-primary text-black
               text-[10px] font-mono tracking-[0.15em] uppercase font-bold
               hover:bg-momento-accent hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]
               transition-all duration-300`
        }
        aria-label="Open beta join instructions"
      >
        {isPrimary ? (
          <>
            {buttonText}
            <span className="text-black/60 group-hover:translate-x-0.5 transition-transform duration-200">
              →
            </span>
          </>
        ) : (
          buttonText
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Join the Momento Beta"
      >
        <BetaContent />
      </Modal>
    </>
  );
}

function BetaContent() {
  return (
    <div className="space-y-8 leading-relaxed">
      {/* Hero blurb */}
      <div>
        <p className="text-momento-primary text-[10px] font-mono uppercase tracking-[0.3em] mb-3">
          Available Now · iOS via TestFlight
        </p>
        <p className="text-white text-base">
          Get early access to Momento. Discover creators near you, follow their
          journeys, and back them directly with embedded Solana wallets — all
          before public launch.
        </p>
      </div>

      {/* Steps */}
      <div>
        <h3 className="text-white font-bold text-base mb-4">How to join</h3>
        <ol className="space-y-3.5">
          <li className="flex gap-4">
            <span className="text-momento-primary font-mono font-bold text-sm shrink-0 w-7">
              01.
            </span>
            <span className="text-sm text-momento-text-secondary">
              <strong className="text-white">Open this page on your iPhone.</strong>{' '}
              TestFlight only works on iOS.
            </span>
          </li>
          <li className="flex gap-4">
            <span className="text-momento-primary font-mono font-bold text-sm shrink-0 w-7">
              02.
            </span>
            <span className="text-sm text-momento-text-secondary">
              <strong className="text-white">Tap the button below.</strong> If
              TestFlight isn&apos;t already installed, the App Store will prompt
              you to install it (free Apple app).
            </span>
          </li>
          <li className="flex gap-4">
            <span className="text-momento-primary font-mono font-bold text-sm shrink-0 w-7">
              03.
            </span>
            <span className="text-sm text-momento-text-secondary">
              <strong className="text-white">Accept the invitation</strong> in
              TestFlight, then tap <strong className="text-white">Install</strong>.
              Momento appears on your home screen with a small orange dot
              indicating it&apos;s a beta build.
            </span>
          </li>
          <li className="flex gap-4">
            <span className="text-momento-primary font-mono font-bold text-sm shrink-0 w-7">
              04.
            </span>
            <span className="text-sm text-momento-text-secondary">
              <strong className="text-white">Open the app, sign in with Google.</strong>{' '}
              Allow location and notifications for the full experience.
            </span>
          </li>
        </ol>
      </div>

      {/* TestFlight CTA */}
      <div className="flex flex-col items-center pt-2">
        <a
          href={TESTFLIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2.5 px-9 py-3.5 rounded-full
                     bg-momento-primary text-black
                     font-mono text-sm uppercase tracking-[0.15em] font-bold
                     hover:bg-momento-accent hover:shadow-[0_0_30px_rgba(0,255,136,0.4)]
                     active:scale-[0.98] transition-all duration-200"
        >
          Open in TestFlight
          <svg
            className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
        <code className="text-[#444] text-[10px] mt-4 break-all max-w-full font-mono tracking-wider">
          {TESTFLIGHT_DISPLAY}
        </code>
      </div>

      {/* Android note */}
      <div className="border-t border-momento-border pt-6">
        <h3 className="text-white font-bold text-sm mb-2">Using Android?</h3>
        <p className="text-sm text-momento-text-secondary">
          Android beta is coming soon. Close this and join the waitlist on
          the homepage — we&apos;ll email you the moment it&apos;s live.
        </p>
      </div>

      {/* Feedback note */}
      <div className="border-t border-momento-border pt-6">
        <h3 className="text-white font-bold text-sm mb-2">Spotted a bug?</h3>
        <p className="text-sm text-momento-text-secondary">
          Shake your iPhone while inside Momento to send a screenshot +
          comment directly to us. Crashes are auto-reported via TestFlight.
        </p>
      </div>
    </div>
  );
}
