import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Show from './pages/Show';
import Remote from './pages/Remote';
import Invitation from './pages/Invitation';
import './styles.css';

function Home() {
  return (
    <div className="center">
      <span className="script big">Parrainage</span>
      <p className="lead">Choisis ton écran</p>
      <nav className="links">
        <Link to="/show?demo=1">Répétition (mode démo)</Link>
        <Link to="/show">Le show (dernière session)</Link>
        <Link to="/remote">Télécommande</Link>
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/show" element={<Show />} />
        <Route path="/remote" element={<Remote />} />
        <Route path="/invitation" element={<Invitation />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
