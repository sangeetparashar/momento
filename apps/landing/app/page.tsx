import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import TickerBanner from '@/components/TickerBanner';
import ProblemHook from '@/components/ProblemHook';
import HowItWorks from '@/components/HowItWorks';
import AppShowcase from '@/components/AppShowcase';
import TokenEconomics from '@/components/TokenEconomics';
import SocialProof from '@/components/SocialProof';
import Team from '@/components/Team';
import FinalCta from '@/components/FinalCta';
import Footer from '@/components/Footer';

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
