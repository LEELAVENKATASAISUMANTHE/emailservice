import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata = {
  title: "Placement ERP — Notification Console",
  description: "Admin approval and email notification dashboard for placement drives"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Notification Console
          </Link>
          <div className="navbar-links">
            <Link href="/admin/notifications" className="navbar-link">
              Admin
            </Link>
            <Link href="/student/dashboard" className="navbar-link">
              Student
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
