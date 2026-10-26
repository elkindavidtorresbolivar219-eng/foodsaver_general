import os
from datetime import date
from functools import wraps

from flask import Flask, jsonify, render_template, request, session
from psycopg2 import errors as pg_errors
from werkzeug.security import check_password_hash, generate_password_hash

from conexion import Conexion

# CONFIGURACIÓN DE LA APLICACIÓN
app = Flask(__name__)
app.secret_key = os.getenv("MERAKI_SECRET_KEY", "cambia-esta-clave-en-produccion")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

db = Conexion()

ROLES = ("Administrador", "Operador", "Contador", "Consulta")
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
        if session["usuario"]["rol"] != "Administrador":
            return error("Solo el Administrador puede gestionar usuarios.", 403)
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
        "UPDATE usuarios SET clave = %s WHERE login = %s RETURNING id",
        (generate_password_hash(nueva), login_),
        retornar=True,
    )
    if not fila:
        return error("El usuario no existe.", 404)
    return jsonify({"ok": True})


# RUTAS DE GESTIÓN DE USUARIOS (RF 2)
@app.get("/api/usuarios")
@solo_admin
def usuarios_listar():
    return jsonify(db.consultar("SELECT id, nombre, apellido, usuario, login, rol FROM usuarios ORDER BY id"))


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

    if not nombre or not apellido or not usuario:
        return error("Nombre, apellido y usuario son obligatorios.")
    if rol not in ROLES:
        return error("Rol no válido.")
    if (not uid or clave) and len(clave) < 4:
        return error("La contraseña debe tener mínimo 4 caracteres.")

    try:
        if uid:
            if clave:
                db.ejecutar(
                    "UPDATE usuarios SET nombre=%s, apellido=%s, usuario=%s, login=%s, clave=%s, rol=%s WHERE id=%s",
                    (nombre, apellido, usuario, login_, generate_password_hash(clave), rol, uid),
                )
            else:
                db.ejecutar(
                    "UPDATE usuarios SET nombre=%s, apellido=%s, usuario=%s, login=%s, rol=%s WHERE id=%s",
                    (nombre, apellido, usuario, login_, rol, uid),
                )
            if session["usuario"]["id"] == uid:
                session["usuario"] = {"id": uid, "nombre": nombre, "apellido": apellido, "usuario": usuario, "login": login_, "rol": rol}
            return jsonify({"ok": True, "mensaje": "Usuario modificado correctamente."})

        db.ejecutar(
            "INSERT INTO usuarios (nombre, apellido, usuario, login, clave, rol) VALUES (%s, %s, %s, %s, %s, %s)",
            (nombre, apellido, usuario, login_, generate_password_hash(clave), rol),
        )
        return jsonify({"ok": True, "mensaje": "Usuario creado correctamente."})
    except pg_errors.UniqueViolation:
        return error("Ese nombre de usuario ya existe.", 409)


@app.post("/api/usuarios/<int:uid>/eliminar")
@solo_admin
def usuarios_eliminar(uid):
    if uid == session["usuario"]["id"]:
        return error("No puede eliminar el usuario que está actualmente conectado.")
    db.ejecutar("DELETE FROM usuarios WHERE id = %s", (uid,))
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

    if pid:
        db.ejecutar(
            "UPDATE proveedores SET nombre=%s,telefono=%s WHERE id=%s",
            (nombre, telefono, pid),
        )
        return jsonify({"ok": True, "mensaje": "Proveedor modificado correctamente."})

    db.ejecutar(
        "INSERT INTO proveedores (nombre,  telefono) VALUES (%s, %s)",
        (nombre, telefono),
    )
    return jsonify({"ok": True, "mensaje": "Proveedor creado correctamente."})


@app.post("/api/proveedores/<int:pid>/eliminar")
@login_requerido
def proveedores_eliminar(pid):
    db.ejecutar("DELETE FROM proveedores WHERE id = %s", (pid,))
    return jsonify({"ok": True})


# RUTAS DE ALIMENTOS E INVENTARIO (RF 3)
@app.get("/api/alimentos")
@login_requerido
def alimentos_listar():
    return jsonify(db.consultar(
<<<<<<< HEAD
        """SELECT id, nombre, categoria, cantidad, precio,
                  to_char(vencimiento, 'YYYY-MM-DD') AS vencimiento, sede
           FROM alimentos ORDER BY id"""
=======
        """SELECT a.id, a.nombre, a.categoria, a.cantidad, a.precio,
                  to_char(a.vencimiento, 'YYYY-MM-DD') AS vencimiento,
                  a.proveedor_id,
                  p.nombre AS proveedor
           FROM alimentos a
           LEFT JOIN proveedores p ON p.id = a.proveedor_id
           ORDER BY a.id"""
>>>>>>> 1fd2ba9dbb743b2cede1cd172981f8c4b735adb6
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
    except ValueError:
        return error("La fecha de vencimiento no es válida.")

    if not nombre or not categoria:
        return error("Nombre y categoría son obligatorios.")
    if cantidad is None:
        return error("La cantidad debe ser un número mayor o igual a 0.")
    if precio is None:
        return error("El precio debe ser un número mayor o igual a 0.")
<<<<<<< HEAD
=======
    if not proveedor_id:
        return error("Selecciona el proveedor de origen.")

    try:
        if aid:
            db.ejecutar(
                """UPDATE alimentos SET nombre=%s, categoria=%s, cantidad=%s,
                          precio=%s, vencimiento=%s, proveedor_id=%s WHERE id=%s""",
                (nombre, categoria, cantidad, precio, vencimiento, proveedor_id, aid),
            )
            return jsonify({"ok": True, "mensaje": "Registro de alimento modificado correctamente."})
>>>>>>> 1fd2ba9dbb743b2cede1cd172981f8c4b735adb6

        db.ejecutar(
<<<<<<< HEAD
            """UPDATE alimentos SET nombre=%s, categoria=%s, cantidad=%s,
                      precio=%s, vencimiento=%s, sede=%s WHERE id=%s""",
            (nombre, categoria, cantidad, precio, vencimiento, sede, aid),
=======
            """INSERT INTO alimentos (nombre, categoria, cantidad, precio, vencimiento, proveedor_id)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (nombre, categoria, cantidad, precio, vencimiento, proveedor_id),
>>>>>>> 1fd2ba9dbb743b2cede1cd172981f8c4b735adb6
        )
    except pg_errors.ForeignKeyViolation:
        return error("El proveedor seleccionado no existe.", 404)

<<<<<<< HEAD
    db.ejecutar(
        """INSERT INTO alimentos (nombre, categoria, cantidad, precio, vencimiento, sede)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (nombre, categoria, cantidad, precio, vencimiento, sede),
    )
=======
>>>>>>> 1fd2ba9dbb743b2cede1cd172981f8c4b735adb6
    return jsonify({"ok": True, "mensaje": "Alimento ingresado correctamente."})


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


# RUTAS DE CONTABILIDAD (RF 5)
@app.get("/api/contabilidad")
@login_requerido
def contabilidad_listar():
    return jsonify(db.consultar(
        """SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, descripcion, valor
           FROM contabilidad ORDER BY id"""
    ))


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

    db.ejecutar(
        "INSERT INTO contabilidad (tipo, descripcion, valor) VALUES (%s, %s, %s)",
        (tipo, descripcion, valor),
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


# EJECUCIÓN DE LA APLICACIÓN
inicializar()

if __name__ == "__main__":
    # Debug solo si defines FLASK_DEBUG=1 en tu .env local
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")

    #joselin