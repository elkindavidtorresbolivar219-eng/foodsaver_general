

// CRUD DE CATEGORÍAS - FOODSAVER


document.addEventListener("DOMContentLoaded", () => {
    cargarCategoriasSelect();

    const btnAbrir = document.getElementById("btnAdministrarCategorias");
    const btnCerrar = document.getElementById("btnCerrarCategorias");
    const formulario = document.getElementById("formCategoria");
    const btnLimpiar = document.getElementById("btnLimpiarCategoria");
    const buscador = document.getElementById("categoriaBuscar");
    const modal = document.getElementById("modalCategorias");

    if (btnAbrir) {
        btnAbrir.addEventListener("click", abrirModalCategorias);
    }

    if (btnCerrar) {
        btnCerrar.addEventListener("click", cerrarModalCategorias);
    }

    if (formulario) {
        formulario.addEventListener("submit", guardarCategoria);
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener("click", limpiarFormularioCategoria);
    }

    if (buscador) {
        buscador.addEventListener("input", renderizarTablaCategoriasModal);
    }

    // Cerrar al hacer clic fuera de la ventana
    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                cerrarModalCategorias();
            }
        });
    }

    // Cerrar con la tecla Escape
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal && modal.style.display === "flex") {
            cerrarModalCategorias();
        }
    });
});



// CARGAR CATEGORÍAS EN EL SELECT DE ALIMENTOS


async function cargarCategoriasSelect() {
    const select = document.getElementById("alimentoCategoria");
    if (!select) return;

    try {
        const respuesta = await fetch("/api/categorias");

        if (!respuesta.ok) {
            throw new Error("No se pudieron cargar las categorías");
        }

        const categorias = await respuesta.json();

        select.innerHTML = '<option value="">Seleccionar categoría</option>';

        categorias.forEach((cat) => {
            const opcion = document.createElement("option");
            opcion.value = cat.nombre;
            opcion.textContent = cat.nombre;
            select.appendChild(opcion);
        });

    } catch (error) {
        console.error("Error al cargar categorías:", error);
    }
}


// ABRIR Y CERRAR MODAL


function abrirModalCategorias() {
    const modal = document.getElementById("modalCategorias");

    if (!modal) {
        console.error("No se encontró el modal de categorías.");
        return;
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");

    limpiarFormularioCategoria();
    renderizarTablaCategoriasModal();
}

function cerrarModalCategorias() {
    const modal = document.getElementById("modalCategorias");

    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }

    limpiarFormularioCategoria();
}


// LIMPIAR FORMULARIO


function limpiarFormularioCategoria() {
    const id = document.getElementById("categoriaId");
    const nombre = document.getElementById("categoriaNombre");
    const mensaje = document.getElementById("mensajeCategoria");
    const boton = document.getElementById("btnGuardarCategoria");

    if (id) id.value = "";
    if (nombre) nombre.value = "";
    if (mensaje) mensaje.textContent = "";

    if (boton) {
        boton.textContent = "Guardar categoría";
    }
}


// LISTAR CATEGORÍAS EN LA TABLA DEL MODAL


async function renderizarTablaCategoriasModal() {
    const tabla = document.getElementById("tablaCategorias");
    const contador = document.getElementById("categoriaContador");

    if (!tabla) return;

    try {
        const respuesta = await fetch("/api/categorias");

        if (!respuesta.ok) {
            throw new Error("Error al consultar categorías");
        }

        const categorias = await respuesta.json();

        const buscador = document.getElementById("categoriaBuscar");
        const filtro = buscador ? buscador.value.trim().toLowerCase() : "";

        const filtradas = categorias.filter((cat) =>
            cat.nombre.toLowerCase().includes(filtro)
        );

        if (contador) {
            contador.textContent =
                `${filtradas.length} categoría(s) registrada(s)`;
        }

        if (filtradas.length === 0) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="2" style="text-align:center; padding:12px;">
                        No se encontraron categorías.
                    </td>
                </tr>
            `;
            return;
        }

        tabla.innerHTML = filtradas.map((cat) => `
            <tr>
                <td>${escaparHTML(cat.nombre)}</td>
                <td>
                    <button
                        type="button"
                        class="boton-secundario"
                        onclick="editarCategoria(${Number(cat.id)})">
                        Editar
                    </button>

                    <button
                        type="button"
                        class="boton-peligro"
                        onclick="eliminarCategoria(${Number(cat.id)})">
                        Eliminar
                    </button>
                </td>
            </tr>
        `).join("");

    } catch (error) {
        console.error("Error al listar categorías:", error);

        tabla.innerHTML = `
            <tr>
                <td colspan="2">Error al cargar las categorías.</td>
            </tr>
        `;
    }
}


// GUARDAR O MODIFICAR CATEGORÍA


async function guardarCategoria(event) {
    event.preventDefault();

    const id = document.getElementById("categoriaId").value;
    const nombre = document.getElementById("categoriaNombre").value.trim();
    const mensaje = document.getElementById("mensajeCategoria");

    if (!nombre) {
        mensaje.textContent = "Escribe el nombre de la categoría.";
        mensaje.style.color = "red";
        return;
    }

    try {
        const respuesta = await fetch("/api/categorias", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: id || null,
                nombre: nombre
            })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.error || "No se pudo guardar la categoría.";
            mensaje.style.color = "red";
            return;
        }

        mensaje.textContent = resultado.mensaje || "Categoría guardada correctamente.";
        mensaje.style.color = "green";

        limpiarFormularioCategoria();
        renderizarTablaCategoriasModal();
        cargarCategoriasSelect();

    } catch (error) {
        console.error("Error al guardar categoría:", error);
        mensaje.textContent = "Error de conexión con el servidor.";
        mensaje.style.color = "red";
    }
}


// EDITAR CATEGORÍA


async function editarCategoria(id) {
    try {
        const respuesta = await fetch("/api/categorias");

        if (!respuesta.ok) {
            throw new Error("No se pudieron consultar las categorías");
        }

        const categorias = await respuesta.json();
        const categoria = categorias.find((cat) => Number(cat.id) === Number(id));

        if (!categoria) return;

        document.getElementById("categoriaId").value = categoria.id;
        document.getElementById("categoriaNombre").value = categoria.nombre;

        const boton = document.getElementById("btnGuardarCategoria");
        const mensaje = document.getElementById("mensajeCategoria");

        boton.textContent = "Actualizar categoría";
        mensaje.textContent = "Editando: " + categoria.nombre;
        mensaje.style.color = "blue";

    } catch (error) {
        console.error("Error al editar categoría:", error);
    }
}



// ELIMINAR CATEGORÍA


async function eliminarCategoria(id) {
    if (!confirm("¿Estás seguro de eliminar esta categoría?")) {
        return;
    }

    const mensaje = document.getElementById("mensajeCategoria");

    try {
        const respuesta = await fetch(`/api/categorias/${id}/eliminar`, {
            method: "POST"
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mensaje.textContent = resultado.error || "No se pudo eliminar la categoría.";
            mensaje.style.color = "red";
            return;
        }

        mensaje.textContent = resultado.mensaje || "Categoría eliminada correctamente.";
        mensaje.style.color = "green";

        limpiarFormularioCategoria();
        renderizarTablaCategoriasModal();
        cargarCategoriasSelect();

    } catch (error) {
        console.error("Error al eliminar categoría:", error);
        mensaje.textContent = "Error de conexión con el servidor.";
        mensaje.style.color = "red";
    }
}



// PROTEGER TEXTO MOSTRADO EN LA TABLA


function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, (caracter) => {
        const entidades = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entidades[caracter];
    });
}
