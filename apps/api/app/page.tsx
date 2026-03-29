import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import TickerBanner from '@/components/landing/TickerBanner';
import ProblemHook from '@/components/landing/ProblemHook';
import HowItWorks from '@/components/landing/HowItWorks';
import AppShowcase from '@/components/landing/AppShowcase';
import TokenEconomics from '@/components/landing/TokenEconomics';
import SocialProof from '@/components/landing/SocialProof';
import Team from '@/components/landing/Team';
import FinalCta from '@/components/landing/FinalCta';
import Footer from '@/components/landing/Footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-momento-bg overflow-hidden">
      <Navbar />
      <Hero />
      <TickerBanner />
      <ProblemHook />
      <HowItWorks />
      <AppShowcase />
      <TokenEconomics />
      <SocialProof />
      <Team />
      <FinalCta />
      <Footer />
    </main>
  );
}
