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
        setMessage(data.message || "You're on the list!");
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
        <div className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-momento-primary/10 border border-momento-primary/20 animate-scale-in">
          <svg
            className="w-5 h-5 text-momento-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-momento-primary font-semibold text-sm">
            You&apos;re on the list!
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row items-center gap-3"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="Enter your email"
          className="w-full md:w-80 px-6 py-3.5 rounded-full bg-white/5 border border-white/10
                     text-white placeholder:text-white/30 text-sm
                     focus:outline-none focus:border-momento-primary focus:ring-1 focus:ring-momento-primary/30
                     transition-all duration-200"
          required
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full md:w-auto px-8 py-3.5 rounded-full bg-momento-primary text-black font-semibold text-sm
                     hover:bg-momento-accent hover:shadow-[0_0_30px_rgba(0,255,136,0.3)]
                     active:scale-[0.98] transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed
                     whitespace-nowrap"
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Joining...
            </span>
          ) : (
            'Get Early Access'
          )}
        </button>
      </form>
      {status === 'error' && (
        <p className="text-red-400 text-xs mt-3 text-center md:text-left">
          {message}
        </p>
      )}
    </div>
  );
}
