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
import { isOriginAllowedForRequest } from './src/server/auth.ts';

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

// 2. CORS estricto: únicamente orígenes explícitos (APP_URL / CORS_ALLOWED_ORIGINS), mismo Host y localhost en desarrollo
app.use((req, res, next) => {
  cors({
    origin: (origin, callback) => {
      // Peticiones sin cabecera Origin (navegación directa, curl local, llamadas internas)
      if (!origin) return callback(null, true);
      callback(null, isOriginAllowedForRequest(origin, req));
    },
    credentials: true, // Habilita la transmisión de cookies HttpOnly seguras
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  })(req, res, next);
});

// 3. Parser de cookies seguro (los parsers JSON/urlencoded con límite acotado se aplican dentro de schoolApp)
app.use(cookieParser());

// 4. Bloqueo preventivo de archivos JSON sensibles, carpetas de respaldos, seeds y datos antes de servir estáticos/Vite
function normalizeSafeRequestPath(rawPath: string): string {
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  const withForwardSlashes = decoded.replace(/\\/g, '/');
  return path.posix.normalize(withForwardSlashes).toLowerCase();
}

app.use((req, res, next) => {
  const reqPathLower = normalizeSafeRequestPath(req.path);

  // No interferir con la API autenticada ni con el manifiesto PWA ni con módulos internos de desarrollo Vite
  if (
    reqPathLower.startsWith('/api/') ||
    reqPathLower === '/manifest.webmanifest' ||
    (!isProd &&
      (reqPathLower.startsWith('/@vite') ||
        reqPathLower.startsWith('/@react-refresh') ||
        reqPathLower.startsWith('/node_modules/')))
  ) {
    next();
    return;
  }

  const isBlockedSensitiveDir =
    reqPathLower.startsWith('/assets/aistudio') ||
    reqPathLower.startsWith('/backups') ||
    reqPathLower.startsWith('/data') ||
    reqPathLower.startsWith('/seeds') ||
    reqPathLower.startsWith('/src/server/seeds');

  const isDirectJsonFile = reqPathLower.endsWith('.json') || reqPathLower.endsWith('.json.map');

  if (isBlockedSensitiveDir || isDirectJsonFile) {
    res.status(403).json({
      error: 'Acceso denegado a recursos internos o archivos de respaldo.',
      code: 'FORBIDDEN_STATIC_RESOURCE',
    });
    return;
  }

  next();
});

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
  startInstitutionalMilestoneScheduler();
});
