import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GoogleAnalytics } from '@next/third-parties/google';
import { Providers } from '@/components/Providers';
import PostHogIdentify from '@/components/PostHogIdentify';
import './globals.css';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const metadata: Metadata = {
  title: 'Agorio Cloud',
  description: 'Hosted observability and control plane for Agorio commerce agents.',
  metadataBase: new URL('https://cloud.agorio.dev'),
  // Authenticated app — never indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          <Suspense fallback={null}>
            <PostHogIdentify />
          </Suspense>
          {children}
        </Providers>
        {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
      </body>
    </html>
  );
}
