import { BarChart3, LayoutDashboard, LogOut, MessageCircle } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo size={30} /> Kiln</div>
        <nav aria-label="Main">
          <NavLink to="/" end><LayoutDashboard size={19} aria-hidden /> Dashboard</NavLink>
          <NavLink to="/tutor"><MessageCircle size={19} aria-hidden /> Ask the tutor</NavLink>
          {isTeacher && <NavLink to="/teacher"><BarChart3 size={19} aria-hidden /> Class analytics</NavLink>}
        </nav>
        <ThemeToggle />
        <div className="who">
          <strong>{user?.name}</strong>
          <span>{isTeacher ? 'Teacher' : 'Student'}{user?.isDemo ? ' · demo account' : ''}</span>
          <button
            className="link"
            onClick={() => {
              logout();
              nav('/login');
            }}
          >
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
