"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/notifications", label: "Admin" },
  { href: "/student/dashboard",   label: "Student" },
  { href: "/admin/importer",      label: "DB Importer" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="navbar-links">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`navbar-link${pathname.startsWith(href) ? " active" : ""}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
