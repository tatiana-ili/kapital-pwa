import type { Metadata, Viewport } from 'next';
import { AuthBoundary } from '@/components/auth-boundary';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Капитал', template: '%s · Капитал' },
  description: 'Личный финансовый центр: счета, операции и понятная аналитика.',
  applicationName: 'Капитал',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Капитал' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <AuthBoundary>{children}</AuthBoundary>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
