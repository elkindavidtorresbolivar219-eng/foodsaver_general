import json
import os
from datetime import date, timedelta
from functools import wraps

from flask import Flask,Response, jsonify, render_template, request, session
from psycopg2 import errors as pg_errors
from werkzeug.security import check_password_hash, generate_password_hash

from conexion import Conexion

# CONFIGURACIÓN DE LA APLICACIÓN
app = Flask(__name__)
app.secret_key = os.getenv("MERAKI_SECRET_KEY", "cambia-esta-clave-en-produccion")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,
)

db = Conexion()

ROLES = ("Administrador", "Operador", "Contador", "Consulta")
ROL_SUPER_ADMIN = "Super Administrador"
ROLES_PROTEGIDOS = {ROL_SUPER_ADMIN, "Administrador"}
TIPOS_CONTABLES = ("Venta", "Gasto operativo", "Inversión en insumos")


# UTILIDADES Y DECORADORES
def error(mensaje, codigo=400):
    return jsonify({"error": mensaje}), codigo


def datos_json():
    return request.get_json(silent=True) or {}


def login_requerido(funcion):
    @wraps(funcion)
    def envoltura(*args, **kwargs):
        if "usuario" not in session:
            return error("Sesión no iniciada.", 401)
        return funcion(*args, **kwargs)
    return envoltura


def solo_admin(funcion):
    @wraps(funcion)
    @login_requerido
    def envoltura(*args, **kwargs):
        if session["usuario"]["rol"] not in ("Administrador", ROL_SUPER_ADMIN):
            return error("Se requiere una cuenta de administrador.", 403)
        return funcion(*args, **kwargs)

    return envoltura


def entero(valor, minimo=0):
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        return None
    return numero if numero >= minimo else None


def inicializar():
    """Crea las tablas y los usuarios iniciales si la base está vacía."""
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    db.ejecutar_archivo(ruta)

    # Tabla de proveedores (no afecta si ya existe)
    db.ejecutar(
        """CREATE TABLE IF NOT EXISTS proveedores (
               id SERIAL PRIMARY KEY,
               nombre VARCHAR(100) NOT NULL,
               telefono VARCHAR(30)
           )"""
    )

    total = db.consultar_uno("SELECT COUNT(*) AS total FROM usuarios")["total"]
    if total == 0:
        iniciales = [
            ("Administrador", "Sistema", "admin", "admin", "1234", "Administrador"),
            ("Operador", "Meraki", "operador", "operador", "1234", "Operador"),
            ("Contador", "Meraki", "contador", "contador", "1234", "Contador"),
        ]
        for nombre, apellido, usuario, login, clave, rol in iniciales:
            # ON CONFLICT evita errores si dos procesos arrancan a la vez
            db.ejecutar(
                """INSERT INTO usuarios (nombre, apellido, usuario, login, clave, rol)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT DO NOTHING""",
                (nombre, apellido, usuario, login, generate_password_hash(clave), rol),
            )


# RUTAS DE VISTAS Y SESIÓN (RF 1)
@app.get("/")
def inicio():
    return render_template("index.html")


@app.post("/api/login")
def login():
    d = datos_json()
    login_ = (d.get("usuario") or "").strip()
    clave = d.get("clave") or ""
    u = db.consultar_uno(
        "SELECT id, nombre, login, clave, rol FROM usuarios WHERE login = %s", (login_,)
    )
    if not u or not check_password_hash(u["clave"], clave):
        return error("Credenciales incorrectas. Verifique usuario y contraseña.", 401)
    session["usuario"] = {"id": u["id"], "nombre": u["nombre"], "login": u["login"], "rol": u["rol"]}
    return jsonify(session["usuario"])


@app.get("/api/sesion")
def sesion_actual():
    return jsonify({"usuario": session.get("usuario")})


@app.post("/api/logout")
def logout():
    session.pop("usuario", None)
    return jsonify({"ok": True})


@app.post("/api/restablecer")
def restablecer():
    d = datos_json()
    login_ = (d.get("usuario") or "").strip()
    nueva = d.get("clave") or ""

    if len(nueva) < 4:
        return error("La contraseña debe tener mínimo 4 caracteres.")

    fila = db.ejecutar(
        "UPDATE usuarios SET clave = %s "
        "WHERE login = %s AND rol NOT IN %s "
        "RETURNING id",
        (generate_password_hash(nueva), login_, tuple(ROLES_PROTEGIDOS)),
        retornar=True,
    )

    if not fila:
        return error("No se puede restablecer esta cuenta desde este formulario.", 403)

    return jsonify({"ok": True})

# RUTAS DE GESTIÓN DE USUARIOS (RF 2)
@app.get("/api/usuarios")
@solo_admin
def usuarios_listar():
    buscar = request.args.get("buscar", "").strip()
    if buscar:
        filas = db.consultar(
            """SELECT id, nombre, apellido, usuario, login, rol
               FROM usuarios
               WHERE login ILIKE %s
               ORDER BY id""",
            (f"%{buscar}%",),
        )
    else:
        filas = db.consultar(
            "SELECT id, nombre, apellido, usuario, login, rol FROM usuarios ORDER BY id"
        )
    return jsonify(filas)


@app.post("/api/usuarios")
@solo_admin
def usuarios_guardar():
    d = datos_json()
    uid = entero(d.get("id"), 1)
    nombre = (d.get("nombre") or "").strip()
    apellido = (d.get("apellido") or "").strip()
    usuario = (d.get("usuario") or "").strip()

    # Asigna automáticamente el usuario al login si no se especifica por separado
    login_ = (d.get("login") or usuario).strip()

    clave = d.get("clave") or ""
    rol = d.get("rol")
    if rol in ROLES_PROTEGIDOS and session["usuario"]["rol"] != ROL_SUPER_ADMIN:
        return error("Solo el Super Administrador puede asignar ese rol.", 403)

    if uid:
        cuenta_actual = db.consultar_uno(
            "SELECT rol FROM usuarios WHERE id = %s",
            (uid,)
        )

        if not cuenta_actual:
            return error("Usuario no encontrado.", 404)

        if cuenta_actual["rol"] in ROLES_PROTEGIDOS and session["usuario"]["rol"] != ROL_SUPER_ADMIN:
            return error("Solo el Super Administrador puede modificar esta cuenta.", 403)

    if not nombre or not apellido or not usuario:
        return error("Nombre, apellido y usuario son obligatorios.")
    if rol not in ROLES:
        return error("Rol no válido.")
    if (not uid or clave) and len(clave) < 4:
        return error("La contraseña debe tener mínimo 4 caracteres.")

    try:
        if uid:
            if clave:
                fila = db.ejecutar(
                    """UPDATE usuarios
                       SET nombre=%s, apellido=%s, usuario=%s, login=%s, clave=%s, rol=%s
                       WHERE id=%s RETURNING id""",
                    (nombre, apellido, usuario, login_, generate_password_hash(clave), rol, uid),
                    retornar=True,
                )
            else:
                fila = db.ejecutar(
                    """UPDATE usuarios
                       SET nombre=%s, apellido=%s, usuario=%s, login=%s, rol=%s
                       WHERE id=%s RETURNING id""",
                    (nombre, apellido, usuario, login_, rol, uid),
                    retornar=True,
                )
            if not fila:
                return error("El usuario no existe.", 404)

            # Si el admin se edita a sí mismo, actualiza su sesión
            if session["usuario"]["id"] == uid:
                session["usuario"] = {"id": uid, "nombre": nombre, "login": login_, "rol": rol}

            return jsonify({"ok": True, "mensaje": "Usuario modificado correctamente."})

        db.ejecutar(
            """INSERT INTO usuarios (nombre, apellido, usuario, login, clave, rol)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (nombre, apellido, usuario, login_, generate_password_hash(clave), rol),
        )
        return jsonify({"ok": True, "mensaje": "Usuario creado correctamente."})

    except pg_errors.UniqueViolation:
        return error("Ya existe un usuario con ese login.", 409)


@app.post("/api/usuarios/<int:uid>/eliminar")
@solo_admin
def usuarios_eliminar(uid):
    if uid == session["usuario"]["id"]:
        return error("No puede eliminar el usuario que está actualmente conectado.")
    es_super_admin = session["usuario"]["rol"] == ROL_SUPER_ADMIN

    eliminada = db.ejecutar(
        "DELETE FROM usuarios "
        "WHERE id = %s AND (%s OR rol NOT IN %s) "
        "RETURNING id",
        (uid, es_super_admin, tuple(ROLES_PROTEGIDOS)),
        retornar=True,
    )

    if not eliminada:
        return error("La cuenta no existe o no tienes permiso para eliminarla.", 403)
    return jsonify({"ok": True})
# RUTAS DE PROVEEDORES
@app.get("/api/proveedores")
@login_requerido
def proveedores_listar():
    return jsonify(db.consultar(
        "SELECT id, nombre,telefono FROM proveedores ORDER BY id"
    ))


@app.post("/api/proveedores")
@login_requerido
def proveedores_guardar():
    d = datos_json()
    pid = entero(d.get("id"), 1)
    nombre = (d.get("nombre") or "").strip()
    telefono = (d.get("telefono") or "").strip()

    if not nombre or not telefono:
        return error("Nombre y teléfono son obligatorios.")

    if not telefono.isdigit():
        return error("El teléfono solo puede contener números.")

    with db.cursor() as cur:
        cur.execute("LOCK TABLE proveedores IN SHARE ROW EXCLUSIVE MODE")

        comprobar_nombre = True
        if pid:
            cur.execute(
                """
                SELECT LOWER(TRIM(nombre)) = LOWER(TRIM(%s)) AS mismo_nombre
                FROM proveedores
                WHERE id = %s
                """,
                (nombre, pid),
            )
            actual = cur.fetchone()
            if actual is None:
                return error("No se encontró el proveedor.", 404)

            # Permite editar el teléfono aunque ya existan duplicados antiguos.
            comprobar_nombre = not actual["mismo_nombre"]

        if comprobar_nombre:
            cur.execute(
                """
                SELECT 1 FROM proveedores
                WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(%s))
                LIMIT 1
                """,
                (nombre,),
            )
            if cur.fetchone() is not None:
                return error("Ya existe un proveedor con ese nombre.", 409)

        if pid:
            cur.execute(
                "UPDATE proveedores SET nombre = %s, telefono = %s WHERE id = %s",
                (nombre, telefono, pid),
            )
            texto = "Proveedor modificado correctamente."
        else:
            cur.execute(
                "INSERT INTO proveedores (nombre, telefono) VALUES (%s, %s)",
                (nombre, telefono),
            )
            texto = "Proveedor creado correctamente."

    return jsonify({"ok": True, "mensaje": texto})


@app.post("/api/proveedores/<int:pid>/eliminar")
@login_requerido
def proveedores_eliminar(pid):
    with db.cursor() as cur:
        cur.execute(
            "SELECT id FROM proveedores WHERE id = %s FOR UPDATE",
            (pid,),
        )
        if cur.fetchone() is None:
            return error("No se encontró el proveedor.", 404)

        cur.execute(
            "SELECT 1 FROM alimentos WHERE proveedor_id = %s LIMIT 1",
            (pid,),
        )
        if cur.fetchone() is not None:
            return error(
                "Este proveedor tiene productos asignados. "
                "Asígnalos a otro proveedor antes de eliminarlo.",
                409,
            )

        cur.execute("DELETE FROM proveedores WHERE id = %s", (pid,))

    return jsonify({"ok": True, "mensaje": "Proveedor eliminado correctamente."})

# rutas del crud para categorias

@app.get("/api/categorias")
@login_requerido
def categorias_listar():
    return jsonify(
        db.consultar("SELECT id, nombre FROM categorias ORDER BY id")
    )

# crear y modificar categoria
@app.post("/api/categorias")
@login_requerido
def categorias_guardar():
    d = datos_json()
    cid = entero(d.get("id"), 1)
    nombre = (d.get("nombre") or "").strip()

    if not nombre:
        return error("El nombre de la categoría es obligatorio.")
    if len(nombre) > 30:
        return error("El nombre no puede superar los 30 caracteres.")

    try:
        if cid:
            fila = db.ejecutar(
                """
                UPDATE categorias
                SET nombre = %s
                WHERE id = %s
                RETURNING id
                """,
                (nombre, cid),
                retornar=True
            )
            if not fila:
                return error("La categoría no existe.", 404)
            return jsonify({
                "ok": True,
                "mensaje": "Categoría modificada correctamente."
            })

        db.ejecutar(
            """
            INSERT INTO categorias (nombre)
            VALUES (%s)
            """,
            (nombre,)
        )
        return jsonify({
            "ok": True,
            "mensaje": "Categoría creada correctamente."
        })

    except pg_errors.UniqueViolation:
        return error("Esta categoría ya está registrada.", 409)

# eliminar categoria
@app.post("/api/categorias/<int:cid>/eliminar")
@login_requerido
def categorias_eliminar(cid):
    try:
        uso = db.consultar_uno(
            """
            SELECT COUNT(*) AS total
            FROM alimentos
            WHERE LOWER(TRIM(categoria)) = LOWER(
                (SELECT nombre FROM categorias WHERE id = %s)
            )
            """,
            (cid,)
        )

        if not uso or uso["total"] > 0:
            return error(
                "No puedes eliminar esta categoría porque está asociada a alimentos.",
                409
            )

        fila = db.ejecutar(
            """
            DELETE FROM categorias
            WHERE id = %s
            RETURNING id
            """,
            (cid,),
            retornar=True
        )

        if not fila:
            return error("La categoría no existe.", 404)

        return jsonify({
            "ok": True,
            "mensaje": "Categoría eliminada correctamente."
        })

    except pg_errors.ForeignKeyViolation:
        return error("No se pudo eliminar la categoría.", 409)

# RUTAS DE ALIMENTOS E INVENTARIO (RF 3)
@app.get("/api/alimentos")
@login_requerido
def alimentos_listar():
    return jsonify(db.consultar(
        """SELECT a.id, a.nombre, a.categoria, a.cantidad, a.precio,
                  to_char(a.vencimiento, 'YYYY-MM-DD') AS vencimiento,
                  a.proveedor_id,
                  p.nombre AS proveedor
           FROM alimentos a
           LEFT JOIN proveedores p ON p.id = a.proveedor_id
           ORDER BY a.id"""
    ))


@app.post("/api/alimentos")
@login_requerido
def alimentos_guardar():
    d = datos_json()

    aid = entero(d.get("id"), 1)
    nombre = (d.get("nombre") or "").strip()
    categoria = (d.get("categoria") or "").strip()
    proveedor_id = entero(d.get("proveedor_id"), 1)

    cantidad = entero(d.get("cantidad"), 0)
    precio = entero(d.get("precio"), 0)

    try:      
        vencimiento = date.fromisoformat(d.get("vencimiento") or "")
    except (ValueError, TypeError):
        return error("La fecha de vencimiento no es válida.")
    
    if vencimiento <= date.today():
        return error("La fecha de vencimiento debe ser a partir de mañana.")
    if not nombre or not categoria:
        return error("Nombre y categoría son obligatorios.")

    if cantidad is None:
        return error("La cantidad debe ser un número mayor o igual a 0.")

    if precio is None:
        return error("El precio debe ser un número mayor o igual a 0.")

    if not aid and not proveedor_id:
        return error("Selecciona el proveedor de origen.")

    try:
        if aid:
            fila = db.ejecutar(
                """
                UPDATE alimentos
                SET nombre = %s,
                    categoria = %s,
                    cantidad = %s,
                    precio = %s,
                    vencimiento = %s,
                    proveedor_id = COALESCE(%s, proveedor_id)
                WHERE id = %s
                RETURNING id
                """,
                (nombre, categoria, cantidad, precio,
                 vencimiento, proveedor_id, aid),
                retornar=True,
            )

            if not fila:
                return error("El alimento que intentas modificar no existe.", 404)

            return jsonify({
                "ok": True,
                "mensaje": "Alimento modificado correctamente."
            })

        db.ejecutar(
            """
            INSERT INTO alimentos
            (nombre, categoria, cantidad, precio, vencimiento, proveedor_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (nombre, categoria, cantidad, precio, vencimiento, proveedor_id),
        )

        return jsonify({
            "ok": True,
            "mensaje": "Alimento ingresado correctamente."
        })

    except pg_errors.ForeignKeyViolation:
        return error("El proveedor seleccionado no existe.", 404)


@app.post("/api/alimentos/<int:aid>/eliminar")
@login_requerido
def alimentos_eliminar(aid):
    db.ejecutar("DELETE FROM alimentos WHERE id = %s", (aid,))
    return jsonify({"ok": True})


# RUTAS DE PÉRDIDAS DE ALIMENTOS
@app.get("/api/perdidas")
@login_requerido
def perdidas_listar():
    return jsonify(db.consultar(
        """SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, alimento,
                  cantidad, motivo, observacion
           FROM perdidas ORDER BY id"""
    ))


@app.post("/api/perdidas")
@login_requerido
def perdidas_registrar():
    d = datos_json()
    aid = entero(d.get("alimento_id"), 1)
    cantidad = entero(d.get("cantidad"), 1)
    motivo = (d.get("motivo") or "").strip()
    observacion = (d.get("observacion") or "").strip()

    if not aid or not cantidad or not motivo:
        return error("Alimento, cantidad y motivo son obligatorios.")

    with db.cursor() as cur:
        cur.execute("SELECT id, nombre, cantidad FROM alimentos WHERE id = %s FOR UPDATE", (aid,))
        alimento = cur.fetchone()
        if not alimento:
            return error("El alimento no existe.", 404)
        if cantidad > alimento["cantidad"]:
            return error("La pérdida no puede superar las existencias actuales.")
        cur.execute("UPDATE alimentos SET cantidad = cantidad - %s WHERE id = %s", (cantidad, aid))
        cur.execute(
            """INSERT INTO perdidas (alimento_id, alimento, cantidad, motivo, observacion)
               VALUES (%s, %s, %s, %s, %s)""",
            (aid, alimento["nombre"], cantidad, motivo, observacion),
        )
    return jsonify({"ok": True, "mensaje": "Pérdida registrada y descontada del inventario."})


# RUTAS DE SEDES (el frontend las consulta en cada carga)
@app.get("/api/sedes")
@login_requerido
def sedes_listar():
    try:
        return jsonify(db.consultar(
            "SELECT id, nombre, estado, actualizacion FROM sedes ORDER BY id"
        ))
    except Exception:
        # Si la tabla no existe o tiene otras columnas, no se rompe la carga.
        return jsonify([])


# RUTAS DE CONTABILIDAD 
@app.get("/api/contabilidad")
@login_requerido
def contabilidad_listar():
    return jsonify(db.consultar("""
        SELECT c.id,
               to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
               c.tipo,
               c.descripcion,
               c.valor,
               (c.id > corte.ultimo_id) AS del_turno
        FROM contabilidad AS c
        CROSS JOIN corte_ventas AS corte
        WHERE corte.id = 1
        ORDER BY c.id
    """))


@app.post("/api/ventas/cerrar-turno")
@solo_admin
def cerrar_turno_ventas():
    ultimo_id = entero(datos_json().get("ultimo_id"), 1)
    if ultimo_id is None:
        return error("No hay operaciones para cerrar.")

    with db.cursor() as cur:
        cur.execute("""
            UPDATE corte_ventas
            SET ultimo_id = GREATEST(ultimo_id, %s)
            WHERE id = 1
              AND EXISTS (
                  SELECT 1 FROM contabilidad WHERE id = %s
              )
        """, (ultimo_id, ultimo_id))

        if cur.rowcount != 1:
            return error("Actualiza la vista de Ventas y vuelve a intentarlo.")

    return jsonify({"ok": True})

@app.post("/api/contabilidad")
@login_requerido
def contabilidad_registrar():
    d = datos_json()
    tipo = d.get("tipo")
    descripcion = (d.get("descripcion") or "").strip()
    valor = entero(d.get("valor"), 0)

    if tipo not in TIPOS_CONTABLES:
        return error("Tipo de operación no válido.")
    if not descripcion:
        return error("La descripción es obligatoria.")
    if valor is None:
        return error("El valor debe ser un número mayor o igual a 0.")

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO contabilidad (tipo, descripcion, valor) VALUES (%s, %s, %s)",
            (tipo, descripcion, valor),
        )
        if tipo == "Venta" and valor > 0:
            cur.execute("SELECT pg_advisory_xact_lock(1, 0)")
            cur.execute(
                "INSERT INTO movimientos_saldo (cuenta, tipo, monto, concepto) VALUES ('admin', 'Ingreso', %s, %s)",
                (valor, descripcion[:200]),
            )
    return jsonify({"ok": True, "mensaje": "Operación contable registrada correctamente."})

# RUTAS DE BILLETERAS DE PROVEEDORES
@app.get("/api/saldos-proveedores")
@login_requerido
def saldos_proveedores_listar():
    return jsonify(db.consultar(
        """SELECT p.id, p.nombre,
                  COALESCE(SUM(CASE WHEN m.tipo = 'Compra' THEN m.monto END), 0)::BIGINT AS compras,
                  COALESCE(SUM(CASE WHEN m.tipo = 'Pago' THEN m.monto END), 0)::BIGINT AS pagos
           FROM proveedores p
           LEFT JOIN movimientos_proveedor m ON m.proveedor_id = p.id
           GROUP BY p.id
           ORDER BY p.id"""
    ))


@app.get("/api/saldos-proveedores/movimientos")
@login_requerido
def saldos_proveedores_movimientos():
    return jsonify(db.consultar(
        """SELECT m.id, to_char(m.fecha, 'DD/MM/YYYY HH24:MI') AS fecha,
                  p.nombre AS proveedor, m.tipo, m.monto, m.concepto
           FROM movimientos_proveedor m
           JOIN proveedores p ON p.id = m.proveedor_id
           ORDER BY m.id DESC
           LIMIT 100"""
    ))


@app.post("/api/saldos-proveedores")
@login_requerido
def saldos_proveedores_registrar():
    d = datos_json()
    pid = entero(d.get("proveedor_id"), 1)
    monto = entero(d.get("monto"), 1)
    tipo = d.get("tipo")
    concepto = (d.get("concepto") or "").strip()

    if not pid or not monto:
        return error("Proveedor y monto (mayor a 0) son obligatorios.")
    if tipo not in ("Compra", "Pago"):
        return error("Tipo de movimiento no válido.")

    with db.cursor() as cur:
        cur.execute("SELECT id FROM proveedores WHERE id = %s FOR UPDATE", (pid,))
        if not cur.fetchone():
            return error("El proveedor no existe.", 404)

        if tipo == "Pago":
            cur.execute(
                """SELECT COALESCE(SUM(CASE WHEN tipo = 'Compra' THEN monto ELSE -monto END), 0) AS deuda
                   FROM movimientos_proveedor WHERE proveedor_id = %s""",
                (pid,),
            )
            if monto > cur.fetchone()["deuda"]:
                return error("El pago supera la deuda actual con este proveedor.")

        cur.execute(
            "INSERT INTO movimientos_proveedor (proveedor_id, tipo, monto, concepto) VALUES (%s, %s, %s, %s)",
            (pid, tipo, monto, concepto or ("Compra a crédito" if tipo == "Compra" else "Pago de deuda")),
        )
    return jsonify({"ok": True, "mensaje": "Movimiento registrado correctamente."})

# RUTAS DE SALDOS (admin, trabajadores y proveedores)

def contador_o_admin(funcion):
    @wraps(funcion)
    @login_requerido
    def envoltura(*args, **kwargs):
        if session["usuario"]["rol"] not in ("Administrador", "Contador"):
            return error("No tienes permiso para modificar saldos.", 403)
        return funcion(*args, **kwargs)
    return envoltura


SQL_SUMA_SALDO = "COALESCE(SUM(CASE WHEN tipo = 'Ingreso' THEN monto ELSE -monto END), 0)::BIGINT"


def saldo_admin_cur(cur):
    cur.execute(f"SELECT {SQL_SUMA_SALDO} AS s FROM movimientos_saldo WHERE cuenta = 'admin'")
    return cur.fetchone()["s"]


def saldo_trabajador_cur(cur, uid):
    cur.execute(
        f"SELECT {SQL_SUMA_SALDO} AS s FROM movimientos_saldo WHERE cuenta = 'trabajador' AND usuario_id = %s",
        (uid,),
    )
    return cur.fetchone()["s"]


@app.get("/api/saldos")
@solo_admin
def saldos_resumen():
    admin = db.consultar_uno(
        f"SELECT {SQL_SUMA_SALDO} AS s FROM movimientos_saldo WHERE cuenta = 'admin'"
    )["s"]

    proveedores = db.consultar(
        """SELECT p.id, p.nombre,
                  COALESCE(SUM(CASE WHEN m.tipo = 'Compra' THEN m.monto ELSE -m.monto END), 0)::BIGINT AS deuda
           FROM proveedores p
           LEFT JOIN movimientos_proveedor m ON m.proveedor_id = p.id
           GROUP BY p.id
           ORDER BY p.nombre"""
    )

    trabajadores = db.consultar(
        f"""SELECT u.id, u.nombre, u.apellido, u.rol,
                   COALESCE(SUM(CASE WHEN s.tipo = 'Ingreso' THEN s.monto ELSE -s.monto END), 0)::BIGINT AS saldo
            FROM usuarios u
            LEFT JOIN movimientos_saldo s ON s.usuario_id = u.id AND s.cuenta = 'trabajador'
            WHERE u.rol <> 'Administrador'
            GROUP BY u.id
            ORDER BY u.nombre"""
    )

    return jsonify({
        "admin": admin,
        "proveedores": proveedores,
        "trabajadores": trabajadores,
        "total_deuda": sum(p["deuda"] for p in proveedores),
        "total_trabajadores": sum(t["saldo"] for t in trabajadores),
    })


@app.get("/api/saldos/movimientos")
@solo_admin
def saldos_movimientos():
    return jsonify(db.consultar(
        """SELECT to_char(fecha, 'DD/MM/YYYY HH24:MI') AS fecha, concepto, cuenta, tipo, monto, sube
           FROM (
               SELECT m.fecha, m.concepto,
                      'Proveedor: ' || p.nombre AS cuenta,
                      CASE m.tipo WHEN 'Compra' THEN 'Deuda aumentó (+)' ELSE 'Pago realizado (-)' END AS tipo,
                      m.monto,
                      (m.tipo = 'Compra') AS sube,
                      m.id AS orden
               FROM movimientos_proveedor m
               JOIN proveedores p ON p.id = m.proveedor_id
               UNION ALL
               SELECT s.fecha, s.concepto,
                      CASE WHEN s.cuenta = 'admin' THEN 'Administrador'
                           ELSE 'Trabajador: ' || u.nombre || ' ' || u.apellido END AS cuenta,
                      CASE s.tipo WHEN 'Ingreso' THEN 'Ingreso (+)' ELSE 'Retiro (-)' END AS tipo,
                      s.monto,
                      (s.tipo = 'Ingreso') AS sube,
                      s.id AS orden
               FROM movimientos_saldo s
               LEFT JOIN usuarios u ON u.id = s.usuario_id
           ) t
           ORDER BY fecha DESC, orden DESC
           LIMIT 100"""
    ))


# ---------- REPORTE DE SALDOS: cómo empezó y cómo terminó un periodo ----------
def rango_periodo(periodo, ref):
    """Devuelve (inicio, fin) donde fin NO está incluido."""
    if periodo == "dia":
        return ref, ref + timedelta(days=1)
    if periodo == "semana":                      # semana de lunes a domingo
        ini = ref - timedelta(days=ref.weekday())
        return ini, ini + timedelta(days=7)
    ini = ref.replace(day=1)                     # mes
    fin = date(ini.year + 1, 1, 1) if ini.month == 12 else date(ini.year, ini.month + 1, 1)
    return ini, fin


def resumen_periodo(tabla, filtro, pos, neg, ini, fin):
    """Saldo inicial, lo que sumó, lo que restó y saldo final de un periodo.
    tabla y filtro son constantes internas (nunca vienen del usuario)."""
    fila = db.consultar_uno(
        f"""SELECT
               COALESCE(SUM(CASE WHEN fecha < %s THEN
                    CASE WHEN tipo = %s THEN monto ELSE -monto END END), 0)::BIGINT AS inicial,
               COALESCE(SUM(CASE WHEN fecha >= %s AND fecha < %s AND tipo = %s
                    THEN monto END), 0)::BIGINT AS aumentos,
               COALESCE(SUM(CASE WHEN fecha >= %s AND fecha < %s AND tipo = %s
                    THEN monto END), 0)::BIGINT AS disminuciones
            FROM {tabla} WHERE {filtro}""",
        (ini, pos, ini, fin, pos, ini, fin, neg),
    )
    fila["final"] = fila["inicial"] + fila["aumentos"] - fila["disminuciones"]
    return fila


@app.get("/api/saldos/reporte")
@solo_admin
def saldos_reporte():
    periodo = request.args.get("periodo", "dia")
    if periodo not in ("dia", "semana", "mes"):
        return error("Periodo no válido.")
    try:
        ref = date.fromisoformat(request.args.get("fecha") or date.today().isoformat())
    except ValueError:
        return error("La fecha no es válida.")

    ini, fin = rango_periodo(periodo, ref)

    movimientos = db.consultar(
        """SELECT to_char(fecha, 'DD/MM/YYYY HH24:MI') AS fecha, concepto, cuenta, tipo, monto, sube
           FROM (
               SELECT m.fecha, m.concepto,
                      'Proveedor: ' || p.nombre AS cuenta,
                      CASE m.tipo WHEN 'Compra' THEN 'Deuda aumentó (+)' ELSE 'Pago realizado (-)' END AS tipo,
                      m.monto, (m.tipo = 'Compra') AS sube, m.id AS orden
               FROM movimientos_proveedor m
               JOIN proveedores p ON p.id = m.proveedor_id
               WHERE m.fecha >= %s AND m.fecha < %s
               UNION ALL
               SELECT s.fecha, s.concepto,
                      CASE WHEN s.cuenta = 'admin' THEN 'Administrador'
                           ELSE 'Trabajador: ' || u.nombre || ' ' || u.apellido END AS cuenta,
                      CASE s.tipo WHEN 'Ingreso' THEN 'Ingreso (+)' ELSE 'Retiro (-)' END AS tipo,
                      s.monto, (s.tipo = 'Ingreso') AS sube, s.id AS orden
               FROM movimientos_saldo s
               LEFT JOIN usuarios u ON u.id = s.usuario_id
               WHERE s.fecha >= %s AND s.fecha < %s
           ) t
           ORDER BY fecha ASC, orden ASC""",
        (ini, fin, ini, fin),
    )

    return jsonify({
        "periodo": periodo,
        "desde": ini.strftime("%d/%m/%Y"),
        "hasta": (fin - timedelta(days=1)).strftime("%d/%m/%Y"),
        "admin": resumen_periodo("movimientos_saldo", "cuenta = 'admin'",
                                 "Ingreso", "Retiro", ini, fin),
        "trabajadores": resumen_periodo("movimientos_saldo", "cuenta = 'trabajador'",
                                        "Ingreso", "Retiro", ini, fin),
        "proveedores": resumen_periodo("movimientos_proveedor", "TRUE",
                                       "Compra", "Pago", ini, fin),
        "movimientos": movimientos,
    })
# ---------- FIN REPORTE DE SALDOS ----------


@app.post("/api/saldos/compra-proveedor")
@contador_o_admin
def saldos_compra_proveedor():
    d = datos_json()
    pid = entero(d.get("proveedor_id"), 1)
    monto = entero(d.get("monto"), 1)
    concepto = (d.get("concepto") or "").strip()

    if not pid or not monto:
        return error("Selecciona un proveedor e ingresa un monto mayor a 0.")
    if not concepto:
        return error("El concepto es obligatorio.")

    with db.cursor() as cur:
        cur.execute("SELECT id FROM proveedores WHERE id = %s FOR UPDATE", (pid,))
        if not cur.fetchone():
            return error("El proveedor no existe.", 404)
        cur.execute(
            "INSERT INTO movimientos_proveedor (proveedor_id, tipo, monto, concepto) VALUES (%s, 'Compra', %s, %s)",
            (pid, monto, concepto),
        )
    return jsonify({"ok": True, "mensaje": "Deuda con el proveedor registrada."})


@app.post("/api/saldos/pago-proveedor")
@contador_o_admin
def saldos_pago_proveedor():
    d = datos_json()
    pid = entero(d.get("proveedor_id"), 1)
    monto = entero(d.get("monto"), 1)

    if not pid or not monto:
        return error("Selecciona un proveedor e ingresa un monto mayor a 0.")

    with db.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(1, 0)")          # bloquea la caja del admin
        cur.execute("SELECT id, nombre FROM proveedores WHERE id = %s FOR UPDATE", (pid,))
        prov = cur.fetchone()
        if not prov:
            return error("El proveedor no existe.", 404)

        cur.execute(
            """SELECT COALESCE(SUM(CASE WHEN tipo = 'Compra' THEN monto ELSE -monto END), 0) AS deuda
               FROM movimientos_proveedor WHERE proveedor_id = %s""",
            (pid,),
        )
        if monto > cur.fetchone()["deuda"]:
            return error("El monto es mayor a la deuda con este proveedor.")

        if monto > saldo_admin_cur(cur):
            return error("El administrador no tiene saldo suficiente para este pago.")

        cur.execute(
            "INSERT INTO movimientos_proveedor (proveedor_id, tipo, monto, concepto) VALUES (%s, 'Pago', %s, 'Pago de deuda')",
            (pid, monto),
        )
        cur.execute(
            "INSERT INTO movimientos_saldo (cuenta, tipo, monto, concepto) VALUES ('admin', 'Retiro', %s, %s)",
            (monto, "Pago a proveedor: " + prov["nombre"]),
        )
    return jsonify({"ok": True, "mensaje": "Pago registrado y descontado del administrador."})


@app.post("/api/saldos/ajuste")
@contador_o_admin
def saldos_ajuste():
    d = datos_json()
    cuenta = d.get("cuenta")                       # 'admin' | 'trabajador'
    tipo = d.get("tipo")                           # 'aumentar' | 'rebajar'
    monto = entero(d.get("monto"), 1)
    uid = entero(d.get("usuario_id"), 1)
    concepto = (d.get("concepto") or "").strip()

    if cuenta not in ("admin", "trabajador") or tipo not in ("aumentar", "rebajar"):
        return error("Datos de ajuste no válidos.")
    if not monto:
        return error("El monto debe ser mayor a 0.")
    if cuenta == "trabajador" and not uid:
        return error("Selecciona un trabajador.")

    mov = "Ingreso" if tipo == "aumentar" else "Retiro"
    concepto = concepto or ("Aumento manual de saldo" if mov == "Ingreso" else "Rebaja manual de saldo")

    with db.cursor() as cur:
        if cuenta == "admin":
            uid = None
            cur.execute("SELECT pg_advisory_xact_lock(1, 0)")
            actual = saldo_admin_cur(cur)
        else:
            cur.execute("SELECT id FROM usuarios WHERE id = %s", (uid,))
            if not cur.fetchone():
                return error("El trabajador no existe.", 404)
            cur.execute("SELECT pg_advisory_xact_lock(2, %s)", (uid,))
            actual = saldo_trabajador_cur(cur, uid)

        if mov == "Retiro" and monto > actual:
            return error("El saldo actual es menor al monto que intentas retirar.")

        cur.execute(
            "INSERT INTO movimientos_saldo (cuenta, usuario_id, tipo, monto, concepto) VALUES (%s, %s, %s, %s, %s)",
            (cuenta, uid, mov, monto, concepto),
        )
    return jsonify({"ok": True, "mensaje": "Saldo actualizado correctamente."})

# RUTAS DE PLATOS (MENÚ)
MAX_FOTO = 3 * 1024 * 1024  # 3 MB

# La foto no viaja en el listado: el navegador la pide aparte en /api/platos/<id>/foto
# El ?v= cambia cuando cambia la foto, así el navegador no muestra una foto vieja.
SQL_PLATO = """SELECT id, nombre, precio, ingredientes,
                      '/api/platos/' || id || '/foto?v=' || substr(md5(foto), 1, 8) AS foto
               FROM platos"""


def leer_datos_plato():
    """Valida nombre, precio e ingredientes del formulario. Devuelve (datos, respuesta_error)."""
    nombre = (request.form.get("nombre") or "").strip()
    precio = entero(request.form.get("precio"), 1)

    try:
        crudos = json.loads(request.form.get("ingredientes") or "[]")
    except json.JSONDecodeError:
        return None, error("Ingredientes inválidos.")

    if not nombre or not precio:
        return None, error("Escribe un nombre y un precio válido.")
    if len(nombre) > 100:
        return None, error("El nombre no puede pasar de 100 caracteres.")

    ingredientes = []
    if isinstance(crudos, list):
        for ing in crudos:
            if not isinstance(ing, dict):
                continue
            ing_nombre = str(ing.get("nombre") or "").strip()
            if ing_nombre:
                ingredientes.append({
                    "nombre": ing_nombre,
                    "cantidad": str(ing.get("cantidad") or "").strip(),
                    "fijo": bool(ing.get("fijo")),
                })
    if not ingredientes:
        return None, error("Agrega al menos un ingrediente.")

    return {"nombre": nombre, "precio": precio, "ingredientes": ingredientes}, None


def leer_foto():
    """Devuelve (contenido, tipo, respuesta_error). Sin archivo: (None, None, None)."""
    foto = request.files.get("foto")
    if not foto or not foto.filename:
        return None, None, None
    if not (foto.mimetype or "").startswith("image/"):
        return None, None, error("Selecciona una foto válida (imagen).")

    contenido = foto.read()
    if not contenido:
        return None, None, error("La foto está vacía.")
    if len(contenido) > MAX_FOTO:
        return None, None, error("La foto no puede pesar más de 3 MB.")
    return contenido, foto.mimetype, None


@app.get("/api/platos")
@login_requerido
def platos_listar():
    return jsonify(db.consultar(SQL_PLATO + " ORDER BY id"))


@app.get("/api/platos/<int:pid>/foto")
@login_requerido
def platos_foto(pid):
    fila = db.consultar_uno(
        "SELECT foto, foto_tipo FROM platos WHERE id = %s", (pid,)
    )
    if not fila:
        return error("Plato no encontrado.", 404)
    respuesta = Response(bytes(fila["foto"]), mimetype=fila["foto_tipo"])
    respuesta.headers["Cache-Control"] = "private, max-age=86400"
    return respuesta


@app.post("/api/platos")
@login_requerido
def platos_crear():
    datos, fallo = leer_datos_plato()
    if fallo:
        return fallo
    contenido, tipo, fallo = leer_foto()
    if fallo:
        return fallo
    if contenido is None:
        return error("Selecciona una foto válida (imagen).")

    fila = db.ejecutar(
        """INSERT INTO platos (nombre, precio, foto, foto_tipo, ingredientes)
           VALUES (%s, %s, %s, %s, %s::jsonb)
           RETURNING id""",
        (datos["nombre"], datos["precio"], contenido, tipo, json.dumps(datos["ingredientes"])),
        retornar=True,
    )
    return jsonify(db.consultar_uno(SQL_PLATO + " WHERE id = %s", (fila["id"],))), 201


@app.post("/api/platos/<int:pid>/editar")
@login_requerido
def platos_editar(pid):
    datos, fallo = leer_datos_plato()
    if fallo:
        return fallo
    contenido, tipo, fallo = leer_foto()   # la foto es opcional al editar
    if fallo:
        return fallo

    if not db.consultar_uno("SELECT id FROM platos WHERE id = %s", (pid,)):
        return error("Plato no encontrado.", 404)

    if contenido is not None:
        db.ejecutar(
            """UPDATE platos
               SET nombre = %s, precio = %s, ingredientes = %s::jsonb, foto = %s, foto_tipo = %s
               WHERE id = %s""",
            (datos["nombre"], datos["precio"], json.dumps(datos["ingredientes"]), contenido, tipo, pid),
        )
    else:
        db.ejecutar(
            """UPDATE platos
               SET nombre = %s, precio = %s, ingredientes = %s::jsonb
               WHERE id = %s""",
            (datos["nombre"], datos["precio"], json.dumps(datos["ingredientes"]), pid),
        )
    return jsonify(db.consultar_uno(SQL_PLATO + " WHERE id = %s", (pid,)))


@app.post("/api/platos/<int:pid>/eliminar")
@login_requerido
def platos_eliminar(pid):
    db.ejecutar("DELETE FROM platos WHERE id = %s", (pid,))
    return jsonify({"ok": True})

# EJECUCIÓN DE LA APLICACIÓN
inicializar()

if __name__ == "__main__":
    # Debug solo si defines FLASK_DEBUG=1 en tu .env local
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")

    #joselin