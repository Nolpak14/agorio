import Hero from '@/components/Hero';
import StatsBar from '@/components/StatsBar';
import WhyAgorio from '@/components/WhyAgorio';
import Adapters from '@/components/Adapters';
import Features from '@/components/Features';
import PlaygroundPreview from '@/components/PlaygroundPreview';
import PricingPreview from '@/components/PricingPreview';
import QuickStart from '@/components/QuickStart';
import Tools from '@/components/Tools';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main>
      <Hero />
      <div className="gradient-divider" />
      <StatsBar />
      <div className="gradient-divider" />
      <WhyAgorio />
      <div className="gradient-divider" />
      <Adapters />
      <div className="gradient-divider" />
      <Features />
      <div className="gradient-divider" />
      <PlaygroundPreview />
      <div className="gradient-divider" />
      <Tools />
      <div className="gradient-divider" />
      <PricingPreview />
      <div className="gradient-divider" />
      <QuickStart />
      <Footer />
    </main>
  );
}
