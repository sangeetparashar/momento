import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Momento',
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-momento-bg text-white">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <Link
          href="/"
          className="text-momento-primary text-sm hover:underline mb-8 inline-block"
        >
          &larr; Back to Home
        </Link>

        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-momento-text-tertiary text-sm mb-12">
          Last updated: March 2026
        </p>

        <div className="space-y-8 text-momento-text-secondary leading-relaxed">
          <section>
            <h2 className="text-white font-bold text-xl mb-3">1. Who We Are</h2>
            <p>
              Momento Inc. (&ldquo;Momento,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is a for-profit
              corporation that operates a digital platform connecting creators and fans
              through tokenized engagement. This Privacy Policy describes how we collect,
              use, and share your personal information when you use our website, mobile
              application, and related services.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">2. Information We Collect</h2>
            <p className="mb-3">
              <strong className="text-white">Account Information:</strong> When you create
              an account, we may collect your name, email address, phone number, and profile
              information. Creators are required to complete identity verification (KYC),
              which may include government-issued identification documents.
            </p>
            <p className="mb-3">
              <strong className="text-white">Financial Information:</strong> We collect
              information related to your transactions on the platform, including wallet
              addresses, transaction history, and token holdings.
            </p>
            <p className="mb-3">
              <strong className="text-white">Usage Information:</strong> We automatically
              collect information about how you use the Service, including device information,
              IP address, browser type, pages visited, and interaction patterns.
            </p>
            <p>
              <strong className="text-white">Location Data:</strong> With your permission,
              we collect location data to provide location-based features such as nearby
              creator discovery.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process transactions and manage your account</li>
              <li>Verify your identity for regulatory compliance</li>
              <li>Send you updates, marketing communications, and promotional offers</li>
              <li>Detect and prevent fraud, abuse, and security threats</li>
              <li>Comply with legal obligations and regulatory requirements</li>
              <li>Analyze usage patterns to improve user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">4. Information Sharing</h2>
            <p>
              We may share your information with: (a) service providers who assist in
              operating the platform; (b) identity verification partners for KYC compliance;
              (c) blockchain networks as required for transaction processing; (d) law
              enforcement or regulatory bodies when required by law; and (e) business
              partners with your consent.
            </p>
            <p className="mt-3">
              We do not sell your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal
              information, including encryption, secure data storage, and access controls.
              However, no method of transmission over the internet or electronic storage
              is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">6. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or
              as needed to provide services. We may also retain information as required by
              applicable laws, including anti-money laundering regulations, which may require
              retention for a minimum of five (5) years after account closure.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">7. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the right to: access your personal
              data; request correction of inaccurate data; request deletion of your data
              (subject to legal retention requirements); opt out of marketing communications;
              and data portability. To exercise these rights, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">8. Cookies and Tracking</h2>
            <p>
              We use cookies and similar tracking technologies to collect usage information
              and improve the Service. You can control cookie preferences through your browser
              settings, though some features may not function properly without cookies.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              material changes by posting the new policy on this page and updating the
              &ldquo;Last updated&rdquo; date. Continued use of the Service constitutes acceptance
              of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-xl mb-3">10. Contact Us</h2>
            <p>
              For questions about this Privacy Policy or to exercise your data rights,
              contact us at{' '}
              <a
                href="mailto:sangeet@moment.network"
                className="text-momento-primary hover:underline"
              >
                sangeet@moment.network
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
