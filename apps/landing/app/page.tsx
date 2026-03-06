import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import TickerBanner from '@/components/TickerBanner';
import HowItWorks from '@/components/HowItWorks';
import WhyMomento from '@/components/WhyMomento';
import AppPreview from '@/components/AppPreview';
import Team from '@/components/Team';
import FinalCta from '@/components/FinalCta';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-momento-bg overflow-hidden">
      <Navbar />
      <Hero />
      <TickerBanner />
      <HowItWorks />
      <WhyMomento />
      <AppPreview />
      <Team />
      <FinalCta />
      <Footer />
    </main>
  );
}
