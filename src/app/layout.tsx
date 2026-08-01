import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gemma Career OS — Partner Karier Bertenaga AI',
  description:
    'Gemma Career OS membaca CV-mu, menilai peluang tiap lowongan, dan menyusun langkah harian menuju pekerjaan impianmu. Ditenagai Gemma di Vertex AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
