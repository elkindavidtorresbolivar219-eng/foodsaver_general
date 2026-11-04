document.addEventListener("DOMContentLoaded", () => {

  // ---- Abrir la vista Platos desde el menú ----
  const botonMenu = document.querySelector('[data-vista="platos"]');

  if (botonMenu) {
    botonMenu.addEventListener("click", (e) => {
      e.preventDefault();

      document.querySelectorAll(".vista").forEach((v) => v.classList.remove("activa"));
      document.getElementById("vista-platos").classList.add("activa");

      document.querySelectorAll(".elemento-menu").forEach((m) => m.classList.remove("activo"));
      botonMenu.classList.add("activo");

      document.getElementById("migas").textContent = "Inicio / Platos";
      document.getElementById("tituloSuperior").textContent = "Platos";
    });
  }

  // ---- Pedido del cliente ----
  const listaPedido = document.getElementById("pedidoLista");
  const totalPedido = document.getElementById("pedidoTotal");
  const contador = document.getElementById("pedidoContador");
  const btnHacerPedido = document.getElementById("btnHacerPedido");
  const mensaje = document.getElementById("mensajePedido");

  const pedido = [];   // { nombre, precio, sin: [ingredientes quitados], cantidad }
  let temporizadorMensaje = null;

  const dinero = (n) => "$" + Number(n).toLocaleString("es-CO");

  function mostrarMensaje(texto, tipo) {
    clearTimeout(temporizadorMensaje);
    mensaje.textContent = texto;
    mensaje.className = "mensaje visible " + tipo;
    temporizadorMensaje = setTimeout(() => mensaje.classList.remove("visible"), 3500);
  }

  function crearBoton(texto, clase, accion) {
    const b = document.createElement("button");
    b.type = "button";
    if (clase) b.className = clase;
    b.textContent = texto;
    b.addEventListener("click", accion);
    return b;
  }

  function dibujarPedido() {
    listaPedido.innerHTML = "";

    if (!pedido.length) {
      const vacio = document.createElement("p");
      vacio.className = "pedido-vacio";
      vacio.textContent = "Aún no hay productos en el pedido.";
      listaPedido.appendChild(vacio);
    }

    let total = 0;
    let unidades = 0;

    pedido.forEach((item, i) => {
      total += item.precio * item.cantidad;
      unidades += item.cantidad;

      const fila = document.createElement("div");
      fila.className = "pedido-item";

      const info = document.createElement("div");
      const nombre = document.createElement("strong");
      nombre.textContent = item.nombre;
      const detalle = document.createElement("small");
      if (item.sin.length) {
        detalle.className = "sin";
        detalle.textContent = "Sin: " + item.sin.join(", ");
      } else {
        detalle.textContent = "Completa";
      }
      info.append(nombre, detalle);

      const cant = document.createElement("div");
      cant.className = "pedido-cant";
      const num = document.createElement("span");
      num.textContent = item.cantidad;
      cant.append(
        crearBoton("−", "", () => {
          item.cantidad--;
          if (item.cantidad <= 0) pedido.splice(i, 1);
          dibujarPedido();
        }),
        num,
        crearBoton("+", "", () => {
          item.cantidad++;
          dibujarPedido();
        })
      );

      const subtotal = document.createElement("span");
      subtotal.className = "pedido-subtotal";
      subtotal.textContent = dinero(item.precio * item.cantidad);

      const quitar = crearBoton("✕", "pedido-quitar", () => {
        pedido.splice(i, 1);
        dibujarPedido();
      });
      quitar.setAttribute("aria-label", "Quitar del pedido");

      fila.append(info, cant, subtotal, quitar);
      listaPedido.appendChild(fila);
    });

    totalPedido.textContent = dinero(total);
    contador.textContent = unidades + (unidades === 1 ? " producto" : " productos");
  }

  function agregarAlPedido(nombre, precio, sin) {
    const clave = [...sin].sort().join("|");
    const existente = pedido.find(
      (p) => p.nombre === nombre && [...p.sin].sort().join("|") === clave
    );

    if (existente) {
      existente.cantidad++;
    } else {
      pedido.push({ nombre, precio, sin, cantidad: 1 });
    }
    dibujarPedido();
  }

  btnHacerPedido.addEventListener("click", () => {
    if (!pedido.length) {
      mostrarMensaje("Agrega al menos un producto al pedido.", "error");
      return;
    }

    const unidades = pedido.reduce((s, p) => s + p.cantidad, 0);
    const total = pedido.reduce((s, p) => s + p.precio * p.cantidad, 0);

    // Aquí después se enviará el pedido al servidor / base de datos:
    // fetch("/api/pedidos", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pedido) })
    console.log("Pedido:", JSON.parse(JSON.stringify(pedido)));

    pedido.length = 0;
    dibujarPedido();
    mostrarMensaje(
      "Pedido realizado: " + unidades + (unidades === 1 ? " producto" : " productos") + " por " + dinero(total) + ".",
      "ok"
    );
  });

  // ---- Cartas de platos ----
  document.querySelectorAll(".plato-carta").forEach((carta) => {
    const filas = carta.querySelectorAll(".plato-ingredientes li");

    // Aviso dentro de la carta (para cuando no se puede quitar un ingrediente)
    const aviso = document.createElement("p");
    aviso.className = "plato-aviso";
    carta.querySelector(".plato-agregar").before(aviso);
    let temporizadorAviso = null;

    function avisar(texto) {
      clearTimeout(temporizadorAviso);
      aviso.textContent = texto;
      temporizadorAviso = setTimeout(() => (aviso.textContent = ""), 2800);
    }

    // A cada ingrediente le agregamos su botón Quitar / Agregar
    // (los que tienen data-fijo son la base del plato y no se pueden quitar)
    filas.forEach((li) => {
      const texto = li.textContent.trim();
      li.textContent = "";

      const nombre = document.createElement("span");
      nombre.className = "ing-nombre";
      nombre.textContent = texto;

      if (li.hasAttribute("data-fijo")) {
        const base = document.createElement("span");
        base.className = "ing-base";
        base.textContent = "Base";
        li.append(nombre, base);
        return;
      }

      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "ing-btn";
      boton.textContent = "Quitar";
      boton.addEventListener("click", (e) => {
        e.stopPropagation();

        // Nunca se puede dejar el plato sin ingredientes
        if (!li.classList.contains("quitado")) {
          const quedan = [...filas].filter((f) => !f.classList.contains("quitado")).length;
          if (quedan <= 1) {
            avisar("El plato debe llevar al menos un ingrediente.");
            return;
          }
        }

        const quitado = li.classList.toggle("quitado");
        boton.textContent = quitado ? "Agregar" : "Quitar";
      });

      li.append(nombre, boton);
    });

    function reiniciarIngredientes() {
      filas.forEach((li) => {
        li.classList.remove("quitado");
        const b = li.querySelector(".ing-btn");
        if (b) b.textContent = "Quitar";
      });
    }

    // Voltear la carta (solo desde el frente; para volver se usa el botón Volver)
    carta.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      carta.classList.add("volteada");
    });

    carta.addEventListener("keydown", (e) => {
      if (e.target !== carta) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        carta.classList.add("volteada");
      }
    });

    carta.querySelector(".plato-volver").addEventListener("click", (e) => {
      e.stopPropagation();
      carta.classList.remove("volteada");
    });

    // Agregar al pedido con los ingredientes que quedaron
    carta.querySelector(".plato-agregar").addEventListener("click", (e) => {
      e.stopPropagation();

      const sin = [];
      filas.forEach((li) => {
        if (li.classList.contains("quitado")) {
          sin.push(li.querySelector(".ing-nombre").textContent);
        }
      });

      const nombre = carta.dataset.nombre;
      agregarAlPedido(nombre, Number(carta.dataset.precio), sin);

      reiniciarIngredientes();
      carta.classList.remove("volteada");
      mostrarMensaje(nombre + " agregado al pedido.", "ok");
    });
  });

  dibujarPedido();
});