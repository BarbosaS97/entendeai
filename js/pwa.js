// PWA: registra o service worker e oferece "Instalar aplicativo" (Android/computador) ou as instruções (iPhone/iPad).
(() => {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker:", e));
    });
  }

  const btn = document.getElementById("btnInstalar");
  const dlg = document.getElementById("dlgInstalar");
  if (!btn) return;

  const instalado = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let convite = null;

  function atualizar() {
    // aparece só quando dá para instalar (ou no iPhone, onde só há instrução) e o app ainda não está instalado
    btn.hidden = instalado() || !(convite || ios);
  }

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; atualizar(); });
  window.addEventListener("appinstalled", () => { convite = null; atualizar(); });
  if (window.matchMedia) {
    const mq = window.matchMedia("(display-mode: standalone)");
    (mq.addEventListener ? mq.addEventListener("change", atualizar) : mq.addListener && mq.addListener(atualizar));
  }

  btn.addEventListener("click", async () => {
    if (convite) {
      convite.prompt();
      try { await convite.userChoice; } catch {}
      convite = null;
      atualizar();
    } else if (dlg && dlg.showModal) {
      dlg.showModal();
    }
  });
  if (dlg) {
    const fechar = document.getElementById("btnInstalarFechar");
    if (fechar) fechar.onclick = () => dlg.close();
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }
  atualizar();
})();
