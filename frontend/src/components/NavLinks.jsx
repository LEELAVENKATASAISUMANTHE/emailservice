import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { href: '/admin/notifications', label: 'Admin' },
  { href: '/student/dashboard',   label: 'Student' },
  { href: '/admin/importer',      label: 'DB Importer' },
];

export default function NavLinks() {
  const location = useLocation();

  return (
    <div className="navbar-links">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          to={href}
          className={`navbar-link${location.pathname.startsWith(href) ? ' active' : ''}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
