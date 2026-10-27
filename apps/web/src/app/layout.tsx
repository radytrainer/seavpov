import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Khmer } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const khmer = Noto_Sans_Khmer({
  subsets: ['khmer'],
  weight: ['400', '500', '600'],
  variable: '--font-khmer',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'សៀវភៅ PN', template: '%s · សៀវភៅ PN' },
  description: 'Track your physical book reading, sessions and reflections.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f9fafb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${khmer.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
