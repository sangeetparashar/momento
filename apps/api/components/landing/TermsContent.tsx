export default function TermsContent() {
  return (
    <>
      <p className="text-momento-text-tertiary text-sm mb-8">
        Last updated: March 2026
      </p>

      <div className="space-y-8 text-momento-text-secondary leading-relaxed">
        <section>
          <h3 className="text-white font-bold text-lg mb-3">1. Acceptance of Terms</h3>
          <p>
            By accessing or using the Momento platform, website, mobile application, or any
            related services (collectively, the &ldquo;Service&rdquo;), you agree to be bound by these
            Terms of Service. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">2. Eligibility</h3>
          <p>
            You must be at least 18 years of age to use Momento. By using the Service,
            you represent and warrant that you meet this age requirement and have the legal
            capacity to enter into a binding agreement. Creators are subject to identity
            verification (KYC) before accessing certain features of the platform.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">3. Risk Disclosure</h3>
          <p className="font-semibold text-momento-error/80 mb-2">
            IMPORTANT: Please read this section carefully.
          </p>
          <p>
            Trading and investing in digital assets, including creator tokens, involves
            substantial risk of loss. The value of tokens may fluctuate significantly and
            you may lose some or all of your investment. Past performance is not indicative
            of future results. You should only invest funds that you can afford to lose entirely.
          </p>
          <p className="mt-3">
            Creator tokens are speculative in nature. Their value is influenced by market
            sentiment, creator activity, and general market conditions. There is no guarantee
            that any token will maintain or increase in value. Momento does not provide
            investment advice, and nothing on the platform should be construed as such.
          </p>
          <p className="mt-3">
            By using the Service, you acknowledge and accept these risks, and agree that
            Momento Inc. shall not be liable for any losses incurred through your use of the
            platform.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">4. User Accounts</h3>
          <p>
            You are responsible for maintaining the confidentiality of your account
            credentials, including any wallet keys associated with your account. You agree
            to notify Momento immediately of any unauthorized use of your account. Momento
            is not responsible for losses arising from unauthorized access to your account.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">5. Prohibited Activities</h3>
          <p>
            You agree not to: (a) use the Service for any unlawful purpose; (b) manipulate
            or artificially inflate the value of any token; (c) engage in wash trading or
            other fraudulent trading practices; (d) interfere with or disrupt the Service;
            (e) attempt to circumvent any security features; or (f) use automated systems
            or bots to interact with the Service without authorization.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">6. Intellectual Property</h3>
          <p>
            All content, features, and functionality of the Service, including but not limited
            to text, graphics, logos, and software, are the exclusive property of Momento Inc.
            and are protected by copyright, trademark, and other intellectual property laws.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">7. Limitation of Liability</h3>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, MOMENTO INC. SHALL NOT BE LIABLE FOR
            ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING
            BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR OTHER INTANGIBLE LOSSES, RESULTING
            FROM YOUR USE OF THE SERVICE. IN NO EVENT SHALL MOMENTO&apos;S TOTAL LIABILITY EXCEED
            THE AMOUNT YOU HAVE PAID TO MOMENTO IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">8. Changes to Terms</h3>
          <p>
            Momento reserves the right to modify these Terms at any time. We will notify
            users of material changes through the Service or via email. Your continued use
            of the Service after such changes constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h3 className="text-white font-bold text-lg mb-3">9. Contact</h3>
          <p>
            For questions about these Terms of Service, contact us at{' '}
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
    </>
  );
}
