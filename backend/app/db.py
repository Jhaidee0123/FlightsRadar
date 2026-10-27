"""Acceso a TursoDB (libSQL).

Con TURSO_DATABASE_URL se conecta directo a Turso (sin archivo local, apto para
Vercel donde el disco es efímero). Sin URL, solo archivo local.
"""

import threading
from typing import Any

import libsql

from app.config import get_settings

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS price_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        depart_date TEXT NOT NULL,
        return_date TEXT,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        source TEXT NOT NULL,
        stops INTEGER,
        airlines TEXT,
        observed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_obs_route
        ON price_observations (origin, destination, currency, depart_date)
    """,
    """
    CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        date_from TEXT NOT NULL,
        date_to TEXT NOT NULL,
        trip_days INTEGER,
        max_stops TEXT NOT NULL DEFAULT 'ANY',
        target_price REAL,
        currency TEXT NOT NULL,
        include_combos INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        best_price REAL,
        best_depart_date TEXT,
        best_return_date TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
        price REAL NOT NULL,
        currency TEXT NOT NULL,
        depart_date TEXT NOT NULL,
        return_date TEXT,
        reason TEXT NOT NULL,
        via TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
]


class Database:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.turso_database_url:
            self._conn = libsql.connect(
                settings.turso_database_url, auth_token=settings.turso_auth_token
            )
        else:
            self._conn = libsql.connect(settings.local_db_path)
        # La conexión de libSQL no es segura entre hilos y fli corre en un threadpool.
        self._lock = threading.Lock()

    def migrate(self) -> None:
        with self._lock:
            for stmt in SCHEMA:
                self._conn.execute(stmt)
            self._conn.commit()

    def execute(self, sql: str, params: tuple = ()) -> int | None:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur.lastrowid

    def executemany(self, sql: str, rows: list[tuple]) -> None:
        if not rows:
            return
        with self._lock:
            self._conn.executemany(sql, rows)
            self._conn.commit()

    def query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            cols = [d[0] for d in cur.description or ()]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def query_one(self, sql: str, params: tuple = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None


_db: Database | None = None
_db_lock = threading.Lock()


def get_db() -> Database:
    # Migración perezosa: en Vercel el lifespan de ASGI no está garantizado.
    global _db
    with _db_lock:
        if _db is None:
            db = Database()
            db.migrate()
            _db = db
    return _db
