import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { PreferencesProvider } from '@/lib/preferences';
import './globals.css';

export const metadata: Metadata = {
  title: 'PharmaCore',
  description: 'Pharmacy management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PreferencesProvider>{children}</PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
