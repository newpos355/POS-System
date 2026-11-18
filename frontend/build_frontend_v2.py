import os

base_dir = r"c:\Users\X9420\Downloads\VNNOX 2\VNNOX2_\pos-platform\frontend"

files = {
    "package.json": """{
  "name": "pos-platform-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "date-fns": "^2.30.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hot-toast": "^2.4.1",
    "react-icons": "^4.12.0",
    "react-router-dom": "^6.20.0",
    "recharts": "^2.10.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.2.0",
    "eslint": "^8.53.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.4",
    "vite": "^5.0.0"
  }
}""",
    "vite.config.js": """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})""",
    "index.html": """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaaS POS Platform</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>""",
    "src/styles/globals.css": """:root {
  --primary: #16A34A;
  --primary-dark: #15803D;
  --primary-light: #DCFCE7;
  --secondary: #0F172A;
  --background: #F8FAFC;
  --surface: #FFFFFF;
  --border: #E2E8F0;
  --text-primary: #0F172A;
  --text-secondary: #64748B;
  --success: #16A34A;
  --warning: #F59E0B;
  --danger: #EF4444;
  --accent: #0D9488;
  
  --font-body: 'Inter', sans-serif;
  --font-heading: 'Outfit', sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-body);
  background-color: var(--background);
  color: var(--text-primary);
  line-height: 1.5;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  color: var(--secondary);
}

a {
  text-decoration: none;
  color: var(--primary);
}

button {
  cursor: pointer;
  font-family: var(--font-body);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  border: none;
  transition: all 0.2s;
  gap: 0.5rem;
}

.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
.btn-outline:hover { background: var(--background); }
.card { background: var(--surface); border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; }
.input-group { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
.input-group label { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.input-group input, .input-group select { padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.375rem; font-family: var(--font-body); }
.input-group input:focus, .input-group select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
""",
    "src/App.jsx": """import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/landing/LandingPage';
import Dashboard from './pages/dashboard/Dashboard';
import POSTerminal from './pages/pos/POSTerminal';
import AppLayout from './components/layout/AppLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pos" element={<POSTerminal />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
export default App;""",
    "src/main.jsx": """import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);""",
    "src/pages/landing/LandingPage.jsx": """import { Link } from 'react-router-dom';
export default function LandingPage() {
  return (
    <div style={{ background: 'var(--secondary)', height: '100vh', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <h1>Powerful POS System</h1>
      <p>For Malls, Supermarkets & Retail Chains</p>
      <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: '1rem' }}>Enter Dashboard</Link>
    </div>
  );
}""",
    "src/pages/dashboard/Dashboard.jsx": """export default function Dashboard() {
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="card">Welcome to the POS Platform!</div>
    </div>
  );
}""",
    "src/pages/pos/POSTerminal.jsx": """import { Link } from 'react-router-dom';
export default function POSTerminal() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 6, padding: '1rem', borderRight: '1px solid var(--border)' }}>
        <h2>POS Terminal</h2>
      </div>
      <div style={{ flex: 4, padding: '1rem', background: 'var(--surface)' }}>
        <h2>Cart</h2>
        <Link to="/dashboard" className="btn btn-outline">Back to Dashboard</Link>
      </div>
    </div>
  );
}""",
    "src/components/layout/AppLayout.jsx": """import { Outlet, Link } from 'react-router-dom';
export default function AppLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: '260px', background: 'var(--secondary)', color: 'white', padding: '1rem' }}>
        <h2>SaaS POS</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '2rem' }}>
          <Link to="/dashboard" style={{ color: 'white' }}>Dashboard</Link>
          <Link to="/pos" style={{ color: 'white' }}>POS Terminal</Link>
        </nav>
      </aside>
      <main style={{ flex: 1, padding: '2rem', overflow: 'auto', background: 'var(--background)' }}>
        <Outlet />
      </main>
    </div>
  );
}"""
}

for rel_path, content in files.items():
    full_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
print("Files generated.")
