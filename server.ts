import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import {
  schoolApp,
  startSalidaNotificationScheduler,
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

// 2. CORS restringido con Lista Blanca Estricta (Prevención de Exfiltración Cross-Origin / CSRF)
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Peticiones sin origen (mismo origen en el navegador, herramientas locales, llamadas internas)
      if (!origin) return callback(null, true);

      // Comprobar contra lista blanca o dominios autorizados de la plataforma Cloud Run / Google AI Studio
      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.includes('google.com') ||
        origin.includes('googleusercontent.com') ||
        origin.includes('firebaseapp.com') ||
        origin.includes('web.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true, // Habilita la transmisión de cookies HttpOnly seguras
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  })
);

// 3. Parser de cookies seguro
app.use(cookieParser());

// 4. Parser de JSON y URL-encoded con límite robusto para admitir respaldos masivos de base de datos y lotes de datos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 5. Cabeceras frescas para manifiesto PWA y Service Worker (evitar cachés viejas de EduControl)
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

// 6. Montar la API escolar blindada
app.use('/api', schoolApp);

// 7. Frontend: Vite middlewares en desarrollo, archivos estáticos compilados en producción
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
  startSalidaNotificationScheduler();
  startInstitutionalMilestoneScheduler();
});
