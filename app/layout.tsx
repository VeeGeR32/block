// app/layout.tsx
import './globals.css';
import { Providers } from './Providers';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}