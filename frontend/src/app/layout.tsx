import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Studenckie PKI',
  description: 'System zarządzania infrastrukturą klucza publicznego',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}
