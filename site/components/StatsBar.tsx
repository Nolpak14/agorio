'use client';

import { useEffect, useRef, useState } from 'react';

const stats = [
  { value: 191, label: 'tests passing', suffix: '' },
  { value: 4, label: 'LLM adapters', suffix: '' },
  { value: 12, label: 'shopping tools', suffix: '' },
  { value: 3, label: 'protocols', suffix: '' },
];

function AnimatedNumber({ target, triggered }: { target: number; triggered: boolean }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!triggered) return;
    const duration = 1200;
    const steps = 30;
    const increment = target / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      if (step >= steps) {
        setCurrent(target);
        clearInterval(timer);
      } else {
        setCurrent(Math.floor(increment * step));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [triggered, target]);

  return <>{current}</>;
}

export default function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`text-center animate-fade-up ${visible ? '' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 100}ms`, animationPlayState: visible ? 'running' : 'paused' }}
            >
              <div className="stat-number text-3xl sm:text-4xl font-bold text-[var(--accent)] mb-1">
                <AnimatedNumber target={stat.value} triggered={visible} />
                {stat.suffix}
              </div>
              <div className="text-sm text-[var(--muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
