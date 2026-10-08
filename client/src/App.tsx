import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './hooks/useAuth';
import Course from './pages/Course';
import Dashboard from './pages/Dashboard';
import Lesson from './pages/Lesson';
import Login from './pages/Login';
import Quiz from './pages/Quiz';
import Tutor from './pages/Tutor';

const TeacherAnalytics = lazy(() => import('./pages/TeacherAnalytics'));
const Exercise = lazy(() => import('./pages/Exercise')); // keeps the code editor out of the first download

function Protected({ roles }: { roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout />;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={!loading && user ? <Navigate to={user.role === 'student' ? '/' : '/teacher'} replace /> : <Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/courses/:courseId" element={<Course />} />
        <Route path="/lessons/:lessonId" element={<Lesson />} />
        <Route path="/quiz/:lessonId" element={<Quiz />} />
        <Route path="/tutor" element={<Tutor />} />
        <Route path="/exercises/:exerciseId" element={<Suspense fallback={<p className="muted">Loading editor…</p>}><Exercise /></Suspense>} />
      </Route>
      <Route element={<Protected roles={['teacher', 'admin']} />}>
        <Route path="/teacher" element={<Suspense fallback={<p className="muted">Loading…</p>}><TeacherAnalytics /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
