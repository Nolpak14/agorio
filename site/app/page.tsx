import Hero from '@/components/Hero';
import WhyAgorio from '@/components/WhyAgorio';
import Adapters from '@/components/Adapters';
import QuickStart from '@/components/QuickStart';
import Tools from '@/components/Tools';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main>
      <Hero />
      <div className="border-t border-[var(--border)]" />
      <WhyAgorio />
      <div className="border-t border-[var(--border)]" />
      <Adapters />
      <div className="border-t border-[var(--border)]" />
      <Tools />
      <div className="border-t border-[var(--border)]" />
      <QuickStart />
      <Footer />
    </main>
  );
}
