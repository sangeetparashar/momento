export default function Footer() {
  return (
    <footer className="border-t border-momento-border py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left">
          <span className="text-white font-extrabold text-lg tracking-tight">
            MOMENTO
          </span>
          <p className="text-momento-text-tertiary text-sm mt-1">
            The Stock Market for Culture
          </p>
        </div>

        <div className="flex items-center gap-6 text-sm text-momento-text-tertiary">
          <a href="#" className="hover:text-white transition-colors duration-200">
            Privacy Policy
          </a>
          <a href="#" className="hover:text-white transition-colors duration-200">
            Terms of Service
          </a>
        </div>

        <p className="text-momento-text-tertiary text-sm">
          &copy; 2025 Momento Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
