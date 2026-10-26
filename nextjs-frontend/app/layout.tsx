import type { Metadata, Viewport } from 'next';
import './globals.css';
import './base.css';
import './dashboard.css';
import './studio.css';
import './personas.css';
import './chat.css';
import './auth.css';
import './orbit.css';
import Script from 'next/script';
import { AuthProvider } from '@/context/auth-context';
import { AmbientCanvas } from '@/components/layout/ambient-canvas';
import { ShellLayout } from '@/components/layout/shell-layout';

export const metadata: Metadata = {
  title: 'My C.AI Universe — Relational Character Studio',
  description:
    'Interactive character roleplay directory backed by relational SQL persistence, semantic recall, and multi-variant scene branching.',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#090b18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="higgsfield">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/assets/vendor/phosphor/2.1.1/style.css" />
        <script type="module" src="/js/ambient-canvas.js" async></script>
      </head>
      <body>
        <Script src="/js/orbit-motion.js" strategy="afterInteractive" />
        <AuthProvider>
          <AmbientCanvas />
          <div className="ambient-grain" aria-hidden="true" />
          <ShellLayout>{children}</ShellLayout>
        </AuthProvider>
      </body>
    </html>
  );
}

