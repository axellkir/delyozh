// Локальный запуск: игра и сервер комнат вместе.  node serve.mjs  →  http://localhost:8777 (PORT=… — другой порт)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.env.PORT = process.env.PORT || '8777';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.STATIC_DIR = process.env.STATIC_DIR || root;
process.env.DATA_DIR = process.env.DATA_DIR || path.join(root, 'server', 'data');
await import('./server/server.mjs');
