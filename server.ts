import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import {
  schoolApp,
  startInstitutionalMilestoneScheduler,
} from './src/server/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? (Number(process.env.PORT) || 3000) : 3000;

// Configurar trust proxy para resolución correcta y segura de IPs tras proxies de Google Cloud
app.set('trust proxy', 1);

// 1. Cabeceras HTTP de Seguridad con Helmet
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Permitir comunicación fluida en iframe con Google AI Studio y Auth Bridge
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Permitir renderizado fluido de assets en preview iframe
    frameguard: false, // Permitir visualización en el iframe oficial de AI Studio
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// 2. CORS restringido mediante validación estricta de URL.hostname (sin coincidencias laxas por subcadena)
const explicitAllowedOrigins = new Set<string>(
  [
    process.env.APP_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : []),
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000',
  ]
    .map((entry) => {
      if (!entry) return '';
      try {
        return new URL(entry.trim()).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
);

function isOriginAllowed(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (explicitAllowedOrigins.has(parsed.origin)) {
    return true;
  }

  const host = parsed.hostname.toLowerCase();

  // Desarrollo local estricto
  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  // Entornos productivos/preview requieren HTTPS y coincidencia exacta de dominio/subdominio permitido
  if (parsed.protocol !== 'https:') {
    return false;
  }

  return (
    host === 'aistudio.google.com' ||
    host.endsWith('.aistudio.google.com') ||
    host === 'ai.studio' ||
    host.endsWith('.ai.studio') ||
    host.endsWith('.run.app') ||
    host.endsWith('.googleusercontent.com') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Peticiones sin origen (mismo origen en el navegador, herramientas locales, llamadas internas)
      if (!origin) return callback(null, true);
      callback(null, isOriginAllowed(origin));
    },
    credentials: true, // Habilita la transmisión de cookies HttpOnly seguras
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  })
);

// 3. Parser de cookies seguro (los parsers JSON/urlencoded con límite acotado se aplican dentro de schoolApp)
app.use(cookieParser());

// 4. Cabeceras frescas para manifiesto PWA y Service Worker (evitar cachés viejas de EduControl)
app.use((req, res, next) => {
  if (req.path === '/manifest.webmanifest') {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path === '/sw.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// 5. Montar la API escolar blindada
app.use('/api', schoolApp);

// 6. Frontend: Vite middlewares en desarrollo, archivos estáticos compilados en producción
if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Seguridad] EduAsist activo en http://0.0.0.0:${PORT} (Modo: ${isProd ? 'Producción' : 'Desarrollo'})`);
  startInstitutionalMilestoneScheduler();
});
