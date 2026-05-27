import { NavLink, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import PracticePage from './pages/PracticePage';
import FeedbackPage from './pages/FeedbackPage';
import AboutPage from './pages/AboutPage';

function AppNavLink({ to, children }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {children}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <div className="background-glow background-glow-left" />
      <div className="background-glow background-glow-right" />

      <header className="top-nav">
        <div className="brand-block">
          <h1>HarmonyHub</h1>
          <p>Music Practice Assistant</p>
        </div>

        <nav>
          <AppNavLink to="/">Home</AppNavLink>
          <AppNavLink to="/practice">Practice</AppNavLink>
          <AppNavLink to="/feedback">Progress</AppNavLink>
          <AppNavLink to="/about">About</AppNavLink>
        </nav>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
    </div>
  );
}
