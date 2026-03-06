'use client';

import { useState } from 'react';

interface WaitlistFormProps {
  className?: string;
}

export default function WaitlistForm({ className = '' }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setMessage(data.message);
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className={`text-center ${className}`}>
        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-momento-primary/10 border border-momento-primary/30">
          <svg
            className="w-5 h-5 text-momento-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-momento-primary font-medium">{message}</span>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col sm:flex-row gap-3 w-full max-w-md ${className}`}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === 'error') setStatus('idle');
        }}
        placeholder="Enter your email"
        className="flex-1 px-5 py-3 rounded-full bg-momento-bg-secondary border border-momento-border
                   text-white placeholder:text-momento-text-tertiary text-sm
                   focus:outline-none focus:border-momento-primary/50 focus:ring-1 focus:ring-momento-primary/20
                   transition-all duration-200"
        required
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-7 py-3 rounded-full bg-momento-primary text-momento-bg font-semibold text-sm
                   hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:scale-[1.02]
                   active:scale-[0.98] transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed
                   whitespace-nowrap"
      >
        {status === 'loading' ? 'Joining...' : 'Join the Waitlist'}
      </button>
      {status === 'error' && (
        <p className="text-momento-error text-xs mt-1 sm:absolute sm:bottom-[-20px] sm:left-0">
          {message}
        </p>
      )}
    </form>
  );
}
