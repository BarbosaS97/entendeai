// Recursos de facilidade de uso: letras maiores, ouvir a resposta, imprimir/PDF, WhatsApp,
// ditado por voz, botões de continuação, avaliação "Isso ajudou?", aviso de privacidade
// e os atalhos da tela inicial (foto, arquivo, digitar).
(() => {
  const App = window.EntendApp;
  if (!App) return;
  const { MODO, sb, state, el, esc, showBanner, enviarTexto } = App;
  const publico = MODO !== "atendente";
  const $ = (id) => document.getElementById(id);

  // localStorage pode estar bloqueado (aba anônima etc.): sempre dentro de try/catch
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

  // Ícones (traço fino, mesmo estilo do restante)
  const I = {
    ouvir: '<svg viewBox="0 0 20 20"><path d="M3 8v4h3l4 3.5v-11L6 8H3z"/><path d="M13 7.5a3.5 3.5 0 010 5M15.5 5a7 7 0 010 10"/></svg>',
    parar: '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>',
    imprimir: '<svg viewBox="0 0 20 20"><path d="M6 7V3h8v4M6 14H4V8h12v6h-2"/><rect x="6" y="11" width="8" height="6"/></svg>',
    whats: '<svg viewBox="0 0 20 20"><path d="M10 3a7 7 0 00-6 10.5L3 17l3.6-1A7 7 0 1010 3z"/><path d="M7.5 8c0 2.5 2 4.5 4.5 4.5l1-1.2-1.6-.8-.7.6a3.5 3.5 0 01-1.7-1.7l.6-.7L9 6.9 7.5 8z"/></svg>',
    ok: '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg>',
  };

  // =====================================================================
  // 1) Letras maiores (A- / A+): usa o "zoom" do navegador, lembra a escolha
  // =====================================================================
  const NIVEIS = [1, 1.12, 1.25, 1.4];
  let nivel = Math.min(Math.max(Number(ler("nivelTexto")) || 0, 0), NIVEIS.length - 1);
  const btnMenos = $("btnMenos"), btnMais = $("btnMais");
  const grupoTam = document.querySelector(".tam-texto");
  const zoomSuportado = !(window.CSS && CSS.supports) || CSS.supports("zoom", "1.2");
  function aplicarNivel() {
    document.documentElement.style.setProperty("--zoom", String(NIVEIS[nivel]));
    document.documentElement.classList.toggle("zoom-alto", nivel >= 2);
    if (btnMenos) btnMenos.disabled = nivel === 0;
    if (btnMais) btnMais.disabled = nivel === NIVEIS.length - 1;
    guardar("nivelTexto", String(nivel));
    document.dispatchEvent(new Event("entend:zoom"));
  }
  if (!zoomSuportado && grupoTam) grupoTam.hidden = true;
  if (btnMenos) btnMenos.onclick = () => { if (nivel > 0) { nivel--; aplicarNivel(); } };
  if (btnMais) btnMais.onclick = () => { if (nivel < NIVEIS.length - 1) { nivel++; aplicarNivel(); } };
  aplicarNivel();

  // =====================================================================
  // 1b) Tema claro / escuro (a escolha fica guardada; o padrão é o claro)
  // =====================================================================
  const btnTema = $("btnTema");
  const ICO_LUA = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 11.5A6.5 6.5 0 018.5 3.5a6.5 6.5 0 108 8z"/></svg>';
  const ICO_SOL = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>';
  function aplicarTema(t) {
    const escuro = t === "escuro";
    document.documentElement.setAttribute("data-tema", escuro ? "escuro" : "claro");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", escuro ? "#080e1d" : "#ffffff");   // cor da barra do navegador no celular
    if (btnTema) {
      const txt = escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro";
      btnTema.innerHTML = (escuro ? ICO_SOL : ICO_LUA) + `<span class="tema-txt">${escuro ? "Tema claro" : "Tema escuro"}</span>`;
      btnTema.setAttribute("aria-label", txt);
      btnTema.setAttribute("aria-pressed", escuro ? "true" : "false");
      btnTema.title = txt;
    }
    // As logos têm texto azul-escuro: no tema escuro usa-se a versão clareada (também sem fundo)
    document.querySelectorAll("img[data-escuro]").forEach((img) => {
      if (!img.dataset.claro) img.dataset.claro = img.getAttribute("src");
      img.setAttribute("src", escuro ? img.dataset.escuro : img.dataset.claro);
      img.setAttribute("data-trocada", "1");
    });
    guardar("tema", escuro ? "escuro" : "claro");
  }
  let tema = ler("tema") === "escuro" ? "escuro" : "claro";
  aplicarTema(tema);
  if (btnTema) btnTema.onclick = () => { tema = tema === "escuro" ? "claro" : "escuro"; aplicarTema(tema); };

  // No celular, tema e tamanho das letras saem do topo e vão para dentro do menu (topo mais limpo)
  (function () {
    const destino = $("sideOpcoes"), origem = document.querySelector(".topbar-actions");
    const itens = [$("btnTema"), grupoTam].filter(Boolean);
    if (!destino || !origem || !itens.length || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 800px)");
    const posicionar = () => {
      if (mq.matches) { itens.forEach((el) => destino.appendChild(el)); }
      else { itens.forEach((el) => origem.appendChild(el)); }
      destino.hidden = !mq.matches;
    };
    posicionar();
    (mq.addEventListener ? mq.addEventListener("change", posicionar) : mq.addListener(posicionar));
  })();

  // No celular, contato, opções e ferramentas ficam num painel que abre por um botão (deixa o histórico livre)
  (function () {
    const btn = $("btnSideMais"), painel = $("sideExtra"), app = $("app");
    if (!btn || !painel) return;
    const abrir = (v) => {
      painel.classList.toggle("aberto", v);
      btn.setAttribute("aria-expanded", v ? "true" : "false");
      btn.classList.toggle("aberto", v);
    };
    btn.addEventListener("click", (e) => { e.stopPropagation(); abrir(!painel.classList.contains("aberto")); });
    document.addEventListener("click", (e) => {
      if (painel.classList.contains("aberto") && !painel.contains(e.target) && !btn.contains(e.target)) abrir(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrir(false); });
    if (app && window.MutationObserver) {
      new MutationObserver(() => { if (!app.classList.contains("menu-open")) abrir(false); }).observe(app, { attributes: true, attributeFilter: ["class"] });
    }
  })();

  // =====================================================================
  // 2) Ouvir a resposta: voz neural LOCAL (Piper, grátis, roda no aparelho) com reserva na voz do navegador
  // =====================================================================
  const temVozNavegador = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let leitura = { id: 0, btn: null };
  const player = new Audio();        // um único player: no iPhone ele é "destravado" no primeiro toque
  const SILENCIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  // estado do botão: "ouvir" | "carregando" | "parar"
  function estadoBotao(btn, estado) {
    if (!btn) return;
    btn.classList.toggle("ativo", estado !== "ouvir");
    btn.classList.toggle("carregando", estado === "carregando");
    btn.setAttribute("aria-busy", estado === "carregando" ? "true" : "false");
    btn.innerHTML = estado === "ouvir"
      ? `${I.ouvir}<span>Ouvir</span>`
      : `${I.parar}<span>${estado === "carregando" ? "Preparando..." : "Parar"}</span>`;
  }
  function pararLeitura() {
    leitura.id++;                      // invalida o que ainda estiver em andamento
    try { player.pause(); } catch {}
    if (temVozNavegador) speechSynthesis.cancel();
    estadoBotao(leitura.btn, "ouvir");
    leitura.btn = null;
  }
  // Divide em trechos curtos por frase. O primeiro é menor, para a voz começar mais rápido.
  function dividirTexto(texto, max = 220, primeiro = max) {
    let frases = texto.replace(/\s+/g, " ").match(/[^.!?:;]+[.!?:;]*\s*/g) || [texto];
    frases = frases.flatMap((f) => (f.length > 400 ? f.match(/[^,;]+[,;]?\s*/g) || [f] : [f]));
    const partes = [];
    let atual = "";
    for (const f of frases) {
      const limite = partes.length === 0 ? primeiro : max;
      if ((atual + f).length > limite && atual) { partes.push(atual.trim()); atual = ""; }
      atual += f;
    }
    if (atual.trim()) partes.push(atual.trim());
    return partes;
  }
  // Deixa o texto mais fácil de pronunciar em português (abreviações e símbolos comuns em documentos)
  function prepararFala(t) {
    return t
      .replace(/\bnº\s*/gi, "número ")
      .replace(/\barts\.\s*/gi, "artigos ")
      .replace(/\bart\.\s*/gi, "artigo ")
      .replace(/§§\s*/g, "parágrafos ")
      .replace(/§\s*/g, "parágrafo ")
      .replace(/R\$\s*([\d.]+(?:,\d+)?)/g, "$1 reais")
      .replace(/(\d)\s*%/g, "$1 por cento")
      .replace(/\s+/g, " ");
  }
  function tocar(blob) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(blob);
      const limpar = () => { URL.revokeObjectURL(url); player.onended = null; player.onerror = null; };
      player.onended = () => { limpar(); ok(); };
      player.onerror = () => { limpar(); falha(new Error("audio")); };
      player.src = url;
      player.play().catch((e) => { limpar(); falha(e); });
    });
  }

  // ----- voz local (Piper): o modelo (~63 MB) é baixado UMA vez e fica guardado no aparelho -----
  const VOZ_MB = 63;
  const vozLocal = { worker: null, pend: new Map(), seq: 0, instalada: null, suporta: null };
  const suportaVozLocal = () => {
    if (vozLocal.suporta === null) {
      vozLocal.suporta = !!(window.Worker && window.WebAssembly && window.caches && window.isSecureContext);
    }
    return vozLocal.suporta;
  };
  function encerrarWorker(motivo) {
    if (vozLocal.worker) { try { vozLocal.worker.terminate(); } catch {} }
    vozLocal.worker = null;
    for (const [, p] of vozLocal.pend) p.falha(new Error(motivo || "worker"));
    vozLocal.pend.clear();
  }
  function chamarWorker(msg, aoProgresso) {
    return new Promise((ok, falha) => {
      if (!vozLocal.worker) {
        try {
          vozLocal.worker = new Worker(new URL("vendor/piper/voz-worker.js", document.baseURI), { type: "module" });
        } catch (e) { return falha(e); }
        vozLocal.worker.onmessage = (ev) => {
          const r = ev.data, p = vozLocal.pend.get(r.id);
          if (!p) return;
          if (r.progresso !== undefined) { if (p.aoProgresso) p.aoProgresso(r.progresso); return; }
          vozLocal.pend.delete(r.id);
          if (r.ok) p.ok(r); else p.falha(new Error(r.erro || "voz"));
        };
        vozLocal.worker.onerror = () => encerrarWorker("worker");
      }
      const id = ++vozLocal.seq;
      vozLocal.pend.set(id, { ok, falha, aoProgresso });
      vozLocal.worker.postMessage({ id, ...msg });
    });
  }
  // true se o modelo já está guardado neste aparelho
  async function vozLocalInstalada() {
    if (!suportaVozLocal()) return false;
    if (vozLocal.instalada === null) {
      try { vozLocal.instalada = !!(await chamarWorker({ tipo: "estado" })).instalada; }
      catch { vozLocal.suporta = false; return false; }
    }
    return vozLocal.instalada;
  }

  // ----- janela "Voz mais natural" (pede permissão antes de baixar 63 MB) -----
  const dlgVoz = $("dlgVozMelhor");
  const LEMBRETE_DIAS = 14;
  function devePerguntar() {
    const r = ler("vozMelhorRecusa");
    if (!r) return true;
    if (r === "nunca") return false;
    return Date.now() - Number(r) > LEMBRETE_DIAS * 86400000;
  }
  // Resolve "instalada" ou "recusada"
  function oferecerVozLocal() {
    if (!dlgVoz) return Promise.resolve("recusada");
    return new Promise((resolve) => {
      const q = (id) => $(id);
      let baixando = false, resolvido = false;
      const fim = (r) => { if (resolvido) return; resolvido = true; if (dlgVoz.open) dlgVoz.close(); resolve(r); };
      const restaurar = () => {
        baixando = false;
        q("vozProgresso").hidden = true; q("vozNunca").hidden = false;
        q("btnVozBaixar").disabled = false; q("btnVozNao").textContent = "Agora não";
      };
      q("vozErro").hidden = true; restaurar();
      q("chkVozNunca").checked = false;
      q("vozBarra").style.width = "0%";

      q("btnVozNao").onclick = () => {
        if (baixando) {                                // cancelar o download em andamento
          encerrarWorker("cancelado"); restaurar();
          q("vozEtapa").textContent = "Baixando a voz...";
          return;
        }
        guardar("vozMelhorRecusa", q("chkVozNunca").checked ? "nunca" : String(Date.now()));
        fim("recusada");
      };
      dlgVoz.addEventListener("cancel", (e) => { e.preventDefault(); q("btnVozNao").click(); }, { once: true });

      q("btnVozBaixar").onclick = async () => {
        try { player.src = SILENCIO; player.play().catch(() => {}); } catch {}   // destrava o áudio (iPhone) dentro do toque
        baixando = true;
        q("vozErro").hidden = true;
        q("vozProgresso").hidden = false; q("vozNunca").hidden = true;
        q("btnVozBaixar").disabled = true; q("btnVozNao").textContent = "Cancelar";
        q("vozEtapa").textContent = "Baixando a voz... não feche esta página.";
        try {
          await chamarWorker({ tipo: "baixar" }, (p) => {
            q("vozBarra").style.width = Math.round(p * 100) + "%";
            q("vozEtapa").textContent = `Baixando a voz... ${Math.round(p * 100)}%`;
          });
          vozLocal.instalada = true;
          atualizarBotaoVoz();
          fim("instalada");
        } catch (e) {
          if (!baixando) return;                       // foi cancelado pela pessoa
          restaurar();
          q("vozErro").textContent = "Não consegui baixar a voz. Verifique sua internet e tente de novo.";
          q("vozErro").hidden = false;
        }
      };
      dlgVoz.showModal();
    });
  }

  // Botão "Voz mais natural" na barra lateral (para preparar com calma, no Wi-Fi)
  const btnVozMenu = $("btnVozMelhor");
  function atualizarBotaoVoz() {
    if (!btnVozMenu) return;
    btnVozMenu.hidden = !(suportaVozLocal() && vozLocal.instalada === false);
  }
  if (btnVozMenu) {
    btnVozMenu.onclick = async () => {
      const r = await oferecerVozLocal();
      if (r === "instalada") showBanner("Pronto! A voz mais natural foi instalada. Toque em Ouvir em qualquer explicação.", false);
    };
    if (suportaVozLocal()) vozLocalInstalada().then(atualizarBotaoVoz);
  }

  // Lê com a voz local: sintetiza um trecho enquanto o anterior toca (sem pausas)
  async function falarLocal(partes, meuId, btn) {
    await chamarWorker({ tipo: "preparar" });          // 1ª vez: alguns segundos para carregar o modelo
    if (leitura.id !== meuId) return;
    const pedidos = [];
    const pedir = (i) => {
      if (i < partes.length && !pedidos[i]) {
        pedidos[i] = chamarWorker({ tipo: "falar", texto: partes[i] }).then((r) => new Blob([r.wav], { type: "audio/wav" }));
        pedidos[i].catch(() => {});
      }
    };
    pedir(0);
    for (let i = 0; i < partes.length; i++) {
      try {
        const blob = await pedidos[i];
        if (leitura.id !== meuId) return;
        pedir(i + 1);                                  // já sintetiza o próximo enquanto este toca
        if (i === 0) estadoBotao(btn, "parar");
        await tocar(blob);
      } catch (e) { e.indice = i; throw e; }
      if (leitura.id !== meuId) return;
    }
    estadoBotao(btn, "ouvir");
    leitura.btn = null;
  }

  // ----- voz do navegador (reserva): sempre português do Brasil -----
  // O navegador carrega a lista de vozes de forma assíncrona; espera um pouco se ela ainda estiver vazia.
  function carregarVozes() {
    return new Promise((ok) => {
      const v = speechSynthesis.getVoices();
      if (v.length) return ok(v);
      const fim = () => { speechSynthesis.removeEventListener("voiceschanged", fim); ok(speechSynthesis.getVoices()); };
      speechSynthesis.addEventListener("voiceschanged", fim);
      setTimeout(fim, 1500);
    });
  }
  const ehPtBR = (v) => v.lang.replace("_", "-").toLowerCase() === "pt-br";
  // Prefere vozes "naturais"/online e as mais conhecidas; ignora qualquer voz que não seja pt-BR
  function pontuarVoz(v) {
    let p = 100;
    if (/natural|online/i.test(v.name)) p += 30;
    if (/google/i.test(v.name)) p += 20;
    if (/francisca|antonio|thalita|maria|luciana|felipe|brasil|brazil/i.test(v.name)) p += 10;
    if (v.localService) p += 2;
    return p;
  }
  async function escolherVoz() {
    const todas = await carregarVozes();
    const ptbr = todas.filter(ehPtBR).sort((a, b) => pontuarVoz(b) - pontuarVoz(a));
    return {
      voz: ptbr[0] || null,
      // há vozes no aparelho, mas nenhuma em pt-BR: melhor não ler do que ler com sotaque ou idioma errado
      semVozPtBR: todas.length > 0 && ptbr.length === 0,
    };
  }
  async function falarNavegador(textoLimpo, meuId, btn) {
    if (!temVozNavegador) {
      estadoBotao(btn, "ouvir"); leitura.btn = null;
      showBanner("Não foi possível ler em voz alta neste aparelho.");
      return;
    }
    const { voz, semVozPtBR } = await escolherVoz();
    if (leitura.id !== meuId) return;                       // a pessoa parou ou trocou de leitura enquanto carregava
    if (semVozPtBR) {
      estadoBotao(btn, "ouvir"); leitura.btn = null;
      showBanner("Este aparelho não tem uma voz em português do Brasil instalada. Toque em \"Voz mais natural\" no menu para baixar uma, ou instale uma nas configurações do sistema.");
      return;
    }
    estadoBotao(btn, "parar");
    const partes = dividirTexto(textoLimpo, 220);
    const fim = () => { if (leitura.id === meuId) { estadoBotao(btn, "ouvir"); leitura.btn = null; } };
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = "pt-BR";
      if (voz) u.voice = voz;
      u.rate = 0.85;
      u.onerror = fim;
      if (i === partes.length - 1) u.onend = fim;
      speechSynthesis.speak(u);
    });
  }

  async function falar(texto, btn) {
    if (leitura.btn === btn) { pararLeitura(); return; }   // segundo toque = parar
    pararLeitura();
    const meuId = ++leitura.id;
    leitura.btn = btn;
    estadoBotao(btn, "carregando");
    // "Destrava" o player (iPhone/Safari exigem que isso aconteça dentro do toque)
    try { player.src = SILENCIO; player.play().catch(() => {}); } catch {}
    const limpo = prepararFala(texto);

    // 1) voz local, se já estiver instalada; ou oferece instalar (uma vez, com permissão)
    let usarLocal = await vozLocalInstalada();
    if (leitura.id !== meuId) return;
    if (!usarLocal && suportaVozLocal() && devePerguntar()) {
      const r = await oferecerVozLocal();
      if (leitura.id !== meuId) return;
      usarLocal = r === "instalada";
      if (usarLocal) estadoBotao(btn, "carregando");
    }
    if (usarLocal) {
      const partes = dividirTexto(limpo, 300, 140);
      try {
        await falarLocal(partes, meuId, btn);
        return;
      } catch (e) {
        if (leitura.id !== meuId) return;
        encerrarWorker("falha");                           // recomeça limpo na próxima vez
        // continua com a voz do navegador, a partir do trecho em que a voz local falhou
        await falarNavegador(partes.slice(e.indice || 0).join(" "), meuId, btn);
        return;
      }
    }
    // 2) voz do navegador
    await falarNavegador(limpo, meuId, btn);
  }
  // Para a leitura ao trocar de conversa ou sair da página
  document.addEventListener("entend:conversa", pararLeitura);
  window.addEventListener("pagehide", pararLeitura);

  // =====================================================================
  // 3) Imprimir / salvar em PDF
  // =====================================================================
  function imprimir(wrap) {
    const bolha = wrap.querySelector(".bubble");
    const w = window.open("", "_blank");
    if (!w) { showBanner("Seu navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo."); return; }
    const base = location.href.replace(/[^/]*$/, "");
    const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Explicação em linguagem simples – EntendAI</title><base href="${base}">
<style>
  body{font-family:Georgia,"Times New Roman",serif;color:#111;line-height:1.55;font-size:12.5pt;margin:0;padding:24px 32px}
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #0a4fc4;padding-bottom:12px;margin-bottom:18px}
  header img{height:54px;width:auto} header span{font:11pt Arial,sans-serif;color:#444}
  h2{font:bold 14pt Arial,sans-serif;color:#0a4fc4;margin:1.2em 0 .3em;border-bottom:1px solid #ccd;padding-bottom:3px}
  ul,ol{padding-left:1.3em} li{margin:.25em 0}
  .callout-prazo{border:1.5px solid #d8a017;border-left:6px solid #d8a017;background:#fff7e0;padding:8px 14px;margin:1em 0;border-radius:6px;page-break-inside:avoid}
  .callout-prazo h2{border:0;color:#7a4f00;margin-top:.2em}
  footer{margin-top:26px;border-top:1px solid #aab;padding-top:10px;font:9.5pt Arial,sans-serif;color:#444}
  @media print{body{padding:0}}
</style></head><body>
<header><img src="img/logo.webp" alt="EntendAI"><span>Explicação em linguagem simples · ${data}</span></header>
<main>${bolha.innerHTML}</main>
<footer>Esta explicação é apenas informativa e não substitui a orientação de advogado(a) ou da Defensoria Pública.<br>
Dúvidas? Atendimento da Justiça Federal no DF: (61) 3221-6600 · (61) 3221-6601 · seate.df@trf1.jus.br</footer>
</body></html>`);
    w.document.close();
    let impresso = false;
    const imprimirAgora = () => { if (impresso) return; impresso = true; w.focus(); w.print(); };
    w.addEventListener("load", () => setTimeout(imprimirAgora, 200));
    setTimeout(imprimirAgora, 1500);   // garantia caso o evento "load" já tenha passado
  }

  // =====================================================================
  // 4) WhatsApp (com aviso sobre dados pessoais)
  // =====================================================================
  const dlgWhats = $("dlgWhats");
  let textoWhats = "";
  function mdParaWhats(md) {
    return md
      .replace(/^#{1,3}\s*(.+)$/gm, "*$1*")        // títulos -> negrito do WhatsApp
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function compartilharWhats(md) {
    textoWhats = mdParaWhats(md);
    if (!dlgWhats) { abrirWhats(); return; }
    dlgWhats.showModal();
  }
  function abrirWhats() {
    let t = textoWhats;
    if (t.length > 3200) t = t.slice(0, 3200).replace(/\s+\S*$/, "") + "…";
    const msg = `*Explicação do EntendAI*\n\n${t}\n\n_Informativo. Não substitui advogado(a)._`;
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
  }
  if (dlgWhats) {
    $("btnWhatsCancelar").onclick = () => dlgWhats.close();
    $("btnWhatsOk").onclick = () => { dlgWhats.close(); abrirWhats(); };
    dlgWhats.addEventListener("click", (e) => { if (e.target === dlgWhats) dlgWhats.close(); });
  }

  // =====================================================================
  // 5) Ditado por voz
  // =====================================================================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btnMic = $("btnMic");
  if (btnMic) {
    if (!SR) {
      btnMic.hidden = true;
    } else {
      btnMic.hidden = false;
      let rec = null, ouvindo = false, textoBase = "";
      const parar = () => { try { rec && rec.stop(); } catch {} };
      const iniciar = () => {
        rec = new SR();
        rec.lang = "pt-BR";
        rec.interimResults = true;
        rec.continuous = false;
        textoBase = el.input.value ? el.input.value.replace(/\s+$/, "") + " " : "";
        rec.onstart = () => {
          ouvindo = true;
          btnMic.classList.add("gravando");
          btnMic.setAttribute("aria-pressed", "true");
          showBanner("Estou ouvindo. Fale agora e, quando terminar, toque no microfone de novo.", false);
        };
        rec.onresult = (e) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          el.input.value = textoBase + t;
          el.input.dispatchEvent(new Event("input"));
        };
        rec.onerror = (e) => {
          const msgs = {
            "not-allowed": "O microfone está bloqueado. Permita o uso do microfone nas configurações do navegador.",
            "service-not-allowed": "O microfone está bloqueado. Permita o uso do microfone nas configurações do navegador.",
            "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
            "audio-capture": "Não encontrei um microfone neste aparelho.",
            "network": "Sem conexão para entender a voz. Tente de novo ou digite.",
          };
          showBanner(msgs[e.error] || "Não consegui entender a voz. Tente de novo ou digite.");
        };
        rec.onend = () => {
          ouvindo = false;
          btnMic.classList.remove("gravando");
          btnMic.setAttribute("aria-pressed", "false");
          if (el.banner.textContent.startsWith("Estou ouvindo")) showBanner("");
          el.input.focus();
        };
        try { rec.start(); } catch { showBanner("Não consegui ligar o microfone. Tente de novo."); }
      };
      btnMic.onclick = () => (ouvindo ? parar() : iniciar());
    }
  }

  // =====================================================================
  // 6) Aviso de privacidade no primeiro uso (chat público)
  // =====================================================================
  const dlgPriv = $("dlgPrivacidade");
  let privAceita = ler("privacidadeOk") === "1";
  function garantirPrivacidade() {
    if (!publico || !dlgPriv || privAceita) return Promise.resolve(true);
    return new Promise((resolve) => {
      let aceitou = false;
      $("btnPrivOk").onclick = () => {
        aceitou = true; privAceita = true; guardar("privacidadeOk", "1"); dlgPriv.close();
      };
      dlgPriv.addEventListener("close", () => resolve(aceitou), { once: true });
      dlgPriv.showModal();
    });
  }

  // =====================================================================
  // 7) Atalhos da tela inicial e câmera com várias fotos
  // =====================================================================
  const camera = $("fileCamera");   // câmera nativa: só como reserva
  if (camera) camera.onchange = () => { App.addFiles([...camera.files]); camera.value = ""; };
  if ($("btnArquivo")) $("btnArquivo").onclick = () => el.fileInput.click();
  if ($("btnDigitar")) $("btnDigitar").onclick = () => {
    el.input.focus();
    el.input.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const ehToque = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const dlgCam = $("dlgCamera"), camVideo = $("camVideo"), camTira = $("camTira"), camDica = $("camDica");
  const btnTirar = $("btnCamTirar"), btnConcluir = $("btnCamConcluir"), camFlash = $("camFlash");
  let camStream = null;
  let fotos = [];                    // { blob, url } na ordem em que foram tiradas

  const reservaCamera = () => (ehToque && camera ? camera.click() : el.fileInput.click());

  function atualizarCamera() {
    const espaco = Math.max(0, (App.MAX_FILES || 10) - state.pending.length);
    camTira.innerHTML = "";
    fotos.forEach((f, i) => {
      const it = document.createElement("div");
      it.className = "cam-mini";
      it.innerHTML = `<img src="${f.url}" alt="Foto ${i + 1}"><span class="n">${i + 1}</span>` +
        `<button type="button" aria-label="Apagar a foto ${i + 1}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>`;
      it.querySelector("button").onclick = () => { URL.revokeObjectURL(f.url); fotos.splice(i, 1); atualizarCamera(); };
      camTira.appendChild(it);
    });
    camTira.hidden = fotos.length === 0;
    camTira.scrollLeft = camTira.scrollWidth;
    btnConcluir.disabled = fotos.length === 0;
    btnConcluir.textContent = fotos.length ? `Concluir (${fotos.length} foto${fotos.length > 1 ? "s" : ""})` : "Concluir";
    btnTirar.querySelector("span").textContent = fotos.length ? "Tirar outra foto" : "Tirar foto";
    btnTirar.disabled = fotos.length >= espaco;
    camDica.textContent = fotos.length >= espaco && fotos.length
      ? "Limite de fotos atingido. Toque em Concluir."
      : fotos.length
        ? `Foto ${fotos.length} salva. Vire a página e toque em Tirar outra foto, ou em Concluir.`
        : "Mostre a página inteira, com boa luz e sem sombra.";
  }
  function fecharCamera() {
    if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
    if (camVideo) camVideo.srcObject = null;
    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    fotos = [];
    if (dlgCam && dlgCam.open) dlgCam.close();
  }
  function cancelarCamera() {
    if (fotos.length && !confirm(`Descartar ${fotos.length === 1 ? "a foto tirada" : "as " + fotos.length + " fotos tiradas"}?`)) return;
    fecharCamera();
  }
  async function abrirCamera() {
    if (!dlgCam || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showBanner("Este navegador não consegue abrir a câmera. Escolha uma foto do aparelho.");
      reservaCamera();
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      camVideo.srcObject = camStream;
      try { await camStream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
      fotos = [];
      atualizarCamera();
      dlgCam.showModal();
      camVideo.play().catch(() => {});
    } catch (e) {
      fecharCamera();
      const bloqueada = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      showBanner(bloqueada
        ? "A câmera está bloqueada. Permita o uso da câmera no navegador ou escolha uma foto do aparelho."
        : "Não encontrei uma câmera. Escolha uma foto do aparelho.");
      reservaCamera();
    }
  }
  if (dlgCam) {
    $("btnCamCancelar").onclick = cancelarCamera;
    dlgCam.addEventListener("cancel", (e) => { e.preventDefault(); cancelarCamera(); });   // tecla Esc
    dlgCam.addEventListener("close", () => { if (camStream) fecharCamera(); });
    btnTirar.onclick = () => {
      if (!camVideo.videoWidth) return;
      const c = document.createElement("canvas");
      c.width = camVideo.videoWidth; c.height = camVideo.videoHeight;
      c.getContext("2d").drawImage(camVideo, 0, 0);
      camFlash.classList.remove("on"); void camFlash.offsetWidth; camFlash.classList.add("on");
      if (navigator.vibrate) navigator.vibrate(30);
      c.toBlob((blob) => {
        if (!blob) return;
        fotos.push({ blob, url: URL.createObjectURL(blob) });
        atualizarCamera();
      }, "image/jpeg", 0.92);
    };
    btnConcluir.onclick = () => {
      const base = state.pending.length;
      const arquivos = fotos.map((f, i) => new File([f.blob], `foto-${base + i + 1}.jpg`, { type: "image/jpeg" }));
      fecharCamera();
      App.addFiles(arquivos);        // lê todas, em ordem, e anexa tudo junto
    };
  }
  if ($("btnFoto")) $("btnFoto").onclick = abrirCamera;

  // =====================================================================
  // =====================================================================
  // 8) Montagem do que aparece embaixo de cada resposta
  // =====================================================================
  const MAIS_SIMPLES = ["Explicar mais simples", "Explique de novo de um jeito ainda mais simples, com frases bem curtas."];
  const semAcentoR = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Sugestões "plano B" (quando a IA não mandou as dela): só o que ainda NÃO está na resposta
  function sugestoesPorConteudo(texto) {
    const t = semAcentoR(texto);
    // só quando a resposta é a explicação de um documento (formato "Resumo em uma frase"); nada de sugestão solta
    if (!/^#{1,3}\s*resumo em uma frase/mi.test(texto)) return [];
    const chips = [];
    if (!/prazo/.test(t)) chips.push(["Tem algum prazo?", "Existe algum prazo ou data importante neste documento?"]);
    if (!/palavras dificeis|glossario/.test(t)) chips.push(["Palavras difíceis", "Explique as palavras difíceis que aparecem neste documento."]);
    if (!/proximos passos|o que fazer|o que o documento indica/.test(t)) chips.push(["O que vem agora?", "O que o documento indica que vai acontecer ou que precisa ser feito agora?"]);
    return chips;
  }
  // Monta as sugestões da resposta: as da IA (sobre o conteúdo) ou o plano B; "mais simples" só em respostas longas
  function montarSugestoes(texto, sugestoesIA) {
    let chips = (sugestoesIA && sugestoesIA.length)
      ? sugestoesIA.map((q) => { const p = q.endsWith("?") ? q : q + "?"; return [p, p]; })
      : sugestoesPorConteudo(texto);
    if (texto.length > 900 && chips.length) chips = [MAIS_SIMPLES, ...chips];
    return chips.slice(0, 4);
  }
  const LINHA_CONTATO =
    'Ficou com dúvida? Fale com o atendimento: <a href="tel:+556132216600">(61) 3221-6600</a> · <a href="tel:+556132216601">3221-6601</a> · <a href="mailto:seate.df@trf1.jus.br">seate.df@trf1.jus.br</a>';

  async function registrarAvaliacao(util, id, comentario) {
    if (!id) return;
    const linha = { mensagem_id: id, util };
    if (comentario) linha.comentario = comentario;
    try { await sb.from("avaliacoes").upsert(linha, { onConflict: "user_id,mensagem_id" }); } catch {}
  }

  function decorar(wrap, texto, id, sugestoesIA = []) {
    // --- ações
    const acoes = document.createElement("div");
    acoes.className = "msg-actions";
    const botao = (rotulo, icone, aoClicar, extra = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link-btn " + extra;
      b.innerHTML = `${icone}<span>${rotulo}</span>`;
      b.onclick = () => aoClicar(b);
      acoes.appendChild(b);
      return b;
    };
    const bolha = wrap.querySelector(".bubble");
    botao("Ouvir", I.ouvir, (b) => falar(bolha.innerText, b), "btn-ouvir");
    const copiar = App.copyButton(() => texto).firstChild;   // reaproveita o botão Copiar
    acoes.appendChild(copiar);
    botao("Imprimir", I.imprimir, () => imprimir(wrap));
    botao("WhatsApp", I.whats, () => compartilharWhats(texto));
    wrap.appendChild(acoes);

    if (!publico) return;

    // --- continuações no contexto desta resposta (só aparecem na última resposta, via CSS)
    const chips = montarSugestoes(texto, sugestoesIA);
    if (chips.length) {
      const seguir = document.createElement("div");
      seguir.className = "msg-seguir";
      seguir.innerHTML = '<span class="msg-seguir-t">Você também pode perguntar:</span>';
      const lista = document.createElement("div");
      lista.className = "msg-seguir-lista";
      chips.forEach(([rotulo, pergunta]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = rotulo;
        b.onclick = () => enviarTexto(pergunta);
        lista.appendChild(b);
      });
      seguir.appendChild(lista);
      wrap.appendChild(seguir);
    }

    // --- "Isso ajudou?"
    const av = document.createElement("div");
    av.className = "msg-avalia";
    av.innerHTML = '<span>Esta explicação ajudou?</span><button type="button" data-v="1">Sim</button><button type="button" data-v="0">Não</button>';
    av.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const util = b.dataset.v === "1";
        registrarAvaliacao(util, id || wrap.dataset.id);
        av.classList.add("respondida");
        if (util) { av.innerHTML = `<span class="ok">${I.ok}Obrigado! Fico feliz em ajudar.</span>`; return; }
        // "Não": caixa de feedback opcional
        av.innerHTML = '<div class="aval-fb">' +
          '<label for="avalTxt">Sentimos muito. Quer nos contar o que não ajudou? <small>(opcional)</small></label>' +
          '<textarea id="avalTxt" rows="3" maxlength="500" placeholder="Ex.: ficou difícil de entender, faltou explicar algo, a resposta não tem a ver com meu documento..."></textarea>' +
          '<small class="aval-aviso">Não escreva dados pessoais (CPF, número do processo, endereço).</small>' +
          '<div class="aval-botoes"><button type="button" class="aval-enviar">Enviar</button><button type="button" class="aval-pular">Agora não</button></div></div>';
        const txt = av.querySelector("textarea");
        const encerrar = (msg) => { av.innerHTML = '<span>' + msg + ' Se precisar, fale com uma pessoa do atendimento, abaixo.</span>'; };
        av.querySelector(".aval-enviar").onclick = () => {
          const c = txt.value.trim();
          if (c) { registrarAvaliacao(false, id || wrap.dataset.id, c); encerrar("Obrigado pelo retorno, ele nos ajuda a melhorar."); }
          else encerrar("Tudo bem.");
        };
        av.querySelector(".aval-pular").onclick = () => encerrar("Tudo bem.");
        setTimeout(() => { try { txt.focus({ preventScroll: true }); } catch {} }, 50);
        if (!util) wrap.classList.add("precisa-ajuda");
      };
    });
    wrap.appendChild(av);

    // --- contato do atendimento
    const contato = document.createElement("div");
    contato.className = "msg-contato";
    contato.innerHTML = LINHA_CONTATO;
    wrap.appendChild(contato);
  }

  window.EntendRecursos = { decorar, garantirPrivacidade, escolherVoz, prepararFala };
})();
