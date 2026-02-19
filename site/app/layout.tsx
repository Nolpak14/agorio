import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agorio — The Open-Source AI Commerce Agent Toolkit',
  description:
    'Build AI agents that discover merchants, browse products, and complete purchases using UCP and ACP protocols. Works with Gemini, Claude, and OpenAI.',
  openGraph: {
    title: 'Agorio — AI Commerce Agent Toolkit',
    description:
      'Build AI shopping agents in 20 lines of TypeScript. Supports UCP + ACP protocols with Gemini, Claude, and OpenAI.',
    url: 'https://agorio.dev',
    siteName: 'Agorio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agorio — AI Commerce Agent Toolkit',
    description:
      'Build AI shopping agents in 20 lines of TypeScript. Supports UCP + ACP protocols.',
  },
  metadataBase: new URL('https://agorio.dev'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
