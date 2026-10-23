CREATE TABLE IF NOT EXISTS usuarios (
    id       SERIAL PRIMARY KEY,
    nombre   VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    usuario  VARCHAR(50)  NOT NULL UNIQUE,
    login    VARCHAR(50)  NOT NULL UNIQUE,
    clave    VARCHAR(255) NOT NULL,
    rol      VARCHAR(20)  NOT NULL
             CHECK (rol IN ('Administrador', 'Operador', 'Contador', 'Consulta'))
);
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(30)
);

-- Migración por si la tabla ya existía sin "login"
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS login VARCHAR(50);
UPDATE usuarios SET login = usuario WHERE login IS NULL;
ALTER TABLE usuarios ALTER COLUMN login SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_login_key ON usuarios (login);

CREATE TABLE IF NOT EXISTS alimentos (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    categoria   VARCHAR(30)  NOT NULL,
    cantidad    INTEGER      NOT NULL CHECK (cantidad >= 0),
    vencimiento DATE         NOT NULL,
    sede        VARCHAR(50)  NOT NULL
);

CREATE TABLE IF NOT EXISTS perdidas (
    id          SERIAL PRIMARY KEY,
    fecha       DATE         NOT NULL DEFAULT CURRENT_DATE,
    alimento_id INTEGER      REFERENCES alimentos(id) ON DELETE SET NULL,
    alimento    VARCHAR(100) NOT NULL,
    cantidad    INTEGER      NOT NULL CHECK (cantidad > 0),
    motivo      VARCHAR(30)  NOT NULL,
    observacion TEXT
);

CREATE TABLE IF NOT EXISTS contabilidad (
    id          SERIAL PRIMARY KEY,
    fecha       DATE         NOT NULL DEFAULT CURRENT_DATE,
    tipo        VARCHAR(20)  NOT NULL CHECK (tipo IN ('Venta', 'Gasto operativo')),
    descripcion VARCHAR(200) NOT NULL,
    valor       BIGINT       NOT NULL CHECK (valor >= 0)
);

CREATE TABLE IF NOT EXISTS movimientos_proveedor (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('Compra', 'Pago')),
    monto BIGINT NOT NULL CHECK (monto > 0),
    concepto VARCHAR(200),
    fecha TIMESTAMP NOT NULL DEFAULT now()
);




-- Seguridad: bloquea el acceso por la API pública de Supabase.
-- Tu backend (rol postgres) no se ve afectado.
ALTER TABLE usuarios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alimentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE perdidas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedes        ENABLE ROW LEVEL SECURITY;