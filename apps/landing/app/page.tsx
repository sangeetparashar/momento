import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import TickerBanner from '@/components/TickerBanner';
import Manifesto from '@/components/Manifesto';
import Product from '@/components/Product';
import Proof from '@/components/Proof';
import FinalCta from '@/components/FinalCta';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-momento-bg overflow-hidden">
      <Navbar />
      <Hero />
      <TickerBanner />
      <Manifesto />
      <Product />
      <Proof />
      <FinalCta />
      <Footer />
    </main>
  );
}
