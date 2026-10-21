import { createRoot } from 'react-dom/client';
import './index.css';
import { getMissingFirebaseWebEnv } from './config/firebaseWebConfig';

const root = createRoot(document.getElementById('root')!);

// Validate configuration before loading any module that initializes Firebase,
// so a misconfigured build shows a clear message instead of a blank page.
const missing = getMissingFirebaseWebEnv((import.meta as any).env || {});

if (missing.length > 0) {
  console.error(`[Config] Faltan variables de entorno de Firebase: ${missing.join(', ')}`);
  root.render(
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#002147', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Configuración incompleta</h1>
        <p style={{ marginBottom: 12, opacity: 0.85 }}>
          Esta compilación no tiene la configuración de Firebase. Faltan las variables:
        </p>
        <ul style={{ fontFamily: 'monospace', fontSize: 14, marginBottom: 12, paddingLeft: 20, listStyle: 'disc' }}>
          {missing.map((key) => <li key={key}>{key}</li>)}
        </ul>
        <p style={{ opacity: 0.85 }}>Ver .env.example y docs/CONFIGURATION.md, y volver a compilar.</p>
      </div>
    </div>
  );
} else {
  import('./AppRoot.tsx').then(({ default: AppRoot }) => {
    root.render(<AppRoot />);
  });
}
