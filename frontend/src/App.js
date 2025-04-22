import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import CRMPage from './pages/CRMPage';
import LoginPage from './pages/LoginPage';
import Chatbot from './components/Chatbot';

function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  return (
    <div className="App">
      <header className="App-header">
        <nav className="main-nav">
          <div className="logo">
            <Link to="/">DemoSolar</Link>
          </div>
          <div className="nav-links">
            <Link to="/">Home</Link>
            {isLoggedIn && <Link to="/crm">CRM Dashboard</Link>}
            {!isLoggedIn && <Link to="/login">Login</Link>}
          </div>
        </nav>
      </header>

      <main className="App-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route 
            path="/crm" 
            element={isLoggedIn ? <CRMPage /> : <LoginPage onLogin={handleLogin} />} 
          />
        </Routes>
      </main>

      {/* Chatbot is always visible on the main site (not in CRM) */}
      {window.location.pathname !== '/crm' && (
        <Chatbot />
      )}
    </div>
  );
}

export default App;
