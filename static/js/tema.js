(() => {
  const raiz = document.documentElement;
  const btnTema = document.getElementById('btnTema');
  if (!btnTema) return;

  function aplicarTema(tema) {
    raiz.dataset.tema = tema;
    localStorage.setItem('tema', tema);
    btnTema.querySelector('.icono-tema').textContent = tema === 'claro' ? '☀' : '☾';
  }

  aplicarTema(raiz.dataset.tema || 'oscuro');

  btnTema.addEventListener('click', (e) => {
    const nuevo = raiz.dataset.tema === 'claro' ? 'oscuro' : 'claro';
    const sinAnimacion = !document.startViewTransition ||
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (sinAnimacion) return aplicarTema(nuevo);

    const x = e.clientX, y = e.clientY;
    const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transicion = document.startViewTransition(() => aplicarTema(nuevo));
    transicion.ready.then(() => {
      raiz.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
      );
    });
  });
})();