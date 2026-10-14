import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor


class Conexion:
    def __init__(self):
        self.config = {
            "host": os.getenv("PGHOST", "localhost"),
            "port": os.getenv("PGPORT", "5432"),
            "dbname": os.getenv("PGDATABASE", "restaurante2"),
            "user": os.getenv("PGUSER", "postgres"),
            "password": os.getenv("PGPASSWORD", "123"),
            "options": "-c timezone=America/Bogota",
        }

    def _conectar(self):
        return psycopg2.connect(**self.config)

    @contextmanager
    def cursor(self):
        conexion = self._conectar()
        try:
            with conexion:
                with conexion.cursor(cursor_factory=RealDictCursor) as cur:
                    yield cur
        finally:
            conexion.close()

    def consultar(self, sql, params=None):
        with self.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def consultar_uno(self, sql, params=None):
        with self.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()

    def ejecutar(self, sql, params=None, retornar=False):
        with self.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone() if retornar else None

    def ejecutar_archivo(self, ruta):
        with open(ruta, encoding="utf-8") as archivo:
            script = archivo.read()
        with self.cursor() as cur:
            cur.execute(script)