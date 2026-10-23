import type { Metadata, Viewport } from 'next';
import './globals.css';
import './base.css';
import './dashboard.css';
import './studio.css';
import './personas.css';
import './chat.css';
import './auth.css';
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
  themeColor: '#060606',
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
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&f[]=cabinet-grotesk@500,700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=Onest:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script src="https://unpkg.com/@phosphor-icons/web@2.1.1" async></script>
        <script type="module" src="/js/ambient-canvas.js" async></script>
      </head>
      <body>
        <AuthProvider>
          <AmbientCanvas />
          <div className="ambient-grain" aria-hidden="true" />
          <ShellLayout>{children}</ShellLayout>
        </AuthProvider>
      </body>
    </html>
  );
}

