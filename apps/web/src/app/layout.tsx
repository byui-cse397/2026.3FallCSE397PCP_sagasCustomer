import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Sagas',
  description: 'A map-based archive of what people know about places.',
};

function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl border-t border-neutral-200 px-6 py-5 text-sm text-neutral-600">
      <Link href="/terms" className="underline">
        Contributor terms
      </Link>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
