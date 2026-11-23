from getpass import getpass

from werkzeug.security import generate_password_hash
from conexion import Conexion

db = Conexion()
login = "superadmin"

existente = db.consultar_uno(
    "SELECT rol FROM usuarios WHERE login = %s OR usuario = %s",
    (login, login),
)

if existente:
    raise SystemExit(f"El usuario superadmin ya existe con rol: {existente['rol']}.")

clave = getpass("Escribe una contraseña para superadmin: ")
confirmacion = getpass("Vuelve a escribir la contraseña: ")

if not clave or clave != confirmacion:
    raise SystemExit("La contraseña está vacía o no coincide. Ejecuta el archivo otra vez.")

db.ejecutar(
    """INSERT INTO usuarios (nombre, apellido, usuario, login, clave, rol)
       VALUES (%s, %s, %s, %s, %s, %s)""",
    ("Super", "Administrador", login, login,
     generate_password_hash(clave), "Super Administrador"),
)

print("Cuenta superadmin creada correctamente.")