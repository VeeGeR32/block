// app/layout.tsx
import './globals.css';
import { Providers } from './Providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
export const metadata = {
  title: 'BLOCK',
  description: 'Architecture Temporelle',
};