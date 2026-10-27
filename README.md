# FlightsRadar

Radar de vuelos baratos. Escanea rangos de fechas, arma combinaciones de tiquetes
separados vía hubs, guarda su propio historial de precios y avisa cuando una ruta
baja. Para comprar, abre la búsqueda exacta en Google Flights.

```
backend/   FastAPI + fli (Google Flights) + TursoDB (libSQL)
frontend/  Next.js 15 + Tailwind 4
```

## Requisitos

- Python 3.12 (`/opt/homebrew/opt/python@3.12/bin/python3.12`)
- Node 22 + pnpm

## Backend

```bash
cd backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # completar TURSO_* y TELEGRAM_* si se usan
.venv/bin/uvicorn app.main:app --port 8010 --reload
```

Sin `TURSO_DATABASE_URL` usa un archivo local `flightsradar.db`. Con Turso:

```bash
turso db create flightsradar
turso db show flightsradar --url      # -> TURSO_DATABASE_URL
turso db tokens create flightsradar   # -> TURSO_AUTH_TOKEN
```

Se conecta directo a Turso (sin archivo local). Las tablas se crean solas con la
primera consulta.

## Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev                    # http://localhost:3000
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/airports?q=tokyo` | Busca aeropuertos por ciudad o código |
| POST | `/api/calendar` | Precio mínimo por día en un rango (solo ida o ida y vuelta con N días) |
| POST | `/api/flights` | Itinerarios concretos para una fecha |
| POST | `/api/combos` | Combinaciones origen → hub → destino con tiquetes separados (estimado) |
| POST | `/api/combos/verify` | Verifica una combinación con vuelos reales y conexión mínima |
| GET | `/api/history` | Mínimo observado por día para una ruta |
| GET/POST | `/api/watches` | Rutas vigiladas por el radar |
| PATCH/DELETE | `/api/watches/{id}` | Pausar/reanudar o eliminar |
| POST | `/api/watches/{id}/check` | Revisar una ruta ahora |
| GET | `/api/alerts` | Alertas generadas |

## Radar y alertas

Las rutas se revisan a mano con “Revisar ahora” en la página Radar. Opcionalmente, en
un servidor propio, `WATCH_INTERVAL_MINUTES` > 0 activa la revisión automática. Se genera
una alerta cuando:

- el precio llega al objetivo,
- cae más de 5% frente al mejor precio anterior, o
- queda en el 10% más barato del historial (mínimo 15 lecturas en ±45 días de la fecha).

Para recibirlas en Telegram: crear un bot con @BotFather, escribirle un mensaje, y
poner `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en `.env`.

## Despliegue en Vercel

Un solo proyecto con dos servicios (`vercel.json`): Next.js sirve la web y FastAPI
responde en `/api/*` en el mismo dominio. Variables en Vercel: `TURSO_DATABASE_URL` y
`TURSO_AUTH_TOKEN`.

```bash
vercel deploy --prod     # desde la raíz del repo
```

## Sobre la fuente de datos

`fli` usa la API interna de Google Flights: es gratis pero no oficial. Si se hacen
muchas consultas seguidas, Google bloquea temporalmente (la API responde 503 con
un mensaje claro). El proveedor guarda en caché 30 min y la búsqueda por hubs
limita el paralelismo, pero para uso continuo conviene cambiar a un proveedor pago
(SearchApi o SerpApi) implementando `FlightProvider` en `backend/app/providers/`.
