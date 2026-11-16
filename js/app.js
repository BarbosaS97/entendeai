(() => {
  const { SUPABASE_URL, SUPABASE_KEY, MAX_FILE_MB } = window.ENTENDE_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $("app"), convList: $("convList"), messages: $("messages"), chat: $("chat"),
    welcome: $("welcome"), input: $("input"), composer: $("composer"), btnSend: $("btnSend"),
    btnNew: $("btnNew"), btnAttach: $("btnAttach"), fileInput: $("fileInput"), files: $("files"),
    banner: $("banner"), topTitle: $("topTitle"), btnMenu: $("btnMenu"), backdrop: $("backdrop"),
    dropzone: $("dropzone"),
  };

  const ICON = {
    trash: '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>',
    close: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15"/></svg>',
    copy: '<svg viewBox="0 0 20 20"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 7V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v6.5A1.5 1.5 0 005 13h2"/></svg>',
    check: '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg>',
    file: '<svg viewBox="0 0 20 20"><path d="M5 2.5h6l4 4v11H5z"/><path d="M11 2.5v4h4"/></svg>',
    download: '<svg viewBox="0 0 20 20"><path d="M10 3v10M6 9l4 4 4-4M4 16.5h12"/></svg>',
    esq: '<svg viewBox="0 0 20 20"><path d="M12 5l-5 5 5 5"/></svg>',
    dir: '<svg viewBox="0 0 20 20"><path d="M8 5l5 5-5 5"/></svg>',
  };

  const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
  const MAX_OCR_PAGES = 12;

  // ---------- bibliotecas pesadas: só carregam quando a pessoa anexa um arquivo ----------
  const LIBS = {
    mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js",
    pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    tesseract: "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js",
  };
  const _libs = {};
  function carregarLib(nome) {
    if (!_libs[nome]) {
      _libs[nome] = new Promise((ok, falha) => {
        const sc = document.createElement("script");
        sc.src = LIBS[nome];
        sc.onload = ok;
        sc.onerror = () => { delete _libs[nome]; falha(new Error("lib")); };
        document.head.appendChild(sc);
      });
    }
    return _libs[nome];
  }

  // ---------- textos de ajuda ----------
  const CONTATO_AJUDA = " Se o problema continuar, fale com o atendimento: (61) 3221-6600 ou seate.df@trf1.jus.br.";
  function erroAmigavel(err) {
    const base = err instanceof TypeError
      ? "Não consegui conectar. Verifique sua internet e tente de novo."
      : (err && err.message) || "Algo deu errado. Tente de novo.";
    return MODO === "atendente" ? base : base + CONTATO_AJUDA;
  }
  // "publico" (padrão) ou "atendente" (definido no <body data-modo="atendente">)
  const MODO = document.body.dataset.modo || "publico";
  // Texto do campo: versão curta no celular, para não ser cortado
  const mqCelular = window.matchMedia("(max-width: 800px)");
  const PH_DESKTOP = el.input.placeholder, PH_CELULAR = "Escreva sua dúvida aqui";
  // Com letras muito grandes no celular sobra pouco espaço: usa o texto mais curto
  const PLACEHOLDER_ATUAL = () => {
    if (!mqCelular.matches) return PH_DESKTOP;
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 1;
    return z > 1.2 ? "Escreva aqui" : PH_CELULAR;
  };
  el.input.placeholder = PLACEHOLDER_ATUAL();
  const atualizarPlaceholder = () => { if (!state.readonly) el.input.placeholder = PLACEHOLDER_ATUAL(); };
  mqCelular.addEventListener("change", atualizarPlaceholder);
  document.addEventListener("entend:zoom", atualizarPlaceholder);
  const state = { user: null, convs: [], currentId: null, pending: [], busy: false, readonly: false };

  // Chama uma Edge Function com a sessão atual
  async function callFn(nome, corpo) {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify(corpo),
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  // Define a conversa aberta e avisa quem precisar saber (ex.: botão "Compartilhar conversa")
  function setCurrent(id) {
    state.currentId = id;
    document.dispatchEvent(new CustomEvent("entend:conversa", { detail: { id } }));
  }

  // Conversa compartilhada sem permissão de escrita: composer bloqueado
  function setReadonly(b) {
    state.readonly = b;
    el.input.disabled = b;
    el.btnAttach.disabled = b;
    const mic = $("btnMic"); if (mic) mic.disabled = b;
    document.body.classList.toggle("somente-leitura", b);
    el.input.placeholder = b ? "Conversa somente leitura" : PLACEHOLDER_ATUAL();
    el.btnSend.disabled = state.busy || b;
  }

  // ---------- util ----------
  const safeName = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const MIMES = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown",
  };
  const mimePorExtensao = (n) => MIMES[(n.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
  const ext = (n) =>(n.split(".").pop() || "").toLowerCase();
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const renderMd = (text) => DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));

  function showBanner(msg, isError = true) {
    el.banner.textContent = msg;
    el.banner.className = "banner" + (isError ? " error" : "");
    el.banner.hidden = !msg;
  }
  const scrollDown = () => { el.chat.scrollTop = el.chat.scrollHeight; };
  function autoGrow() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 220) + "px";
  }
  function setBusy(b) { state.busy = b; el.btnSend.disabled = b || state.readonly; }

  function copyButton(getText) {
    const wrap = document.createElement("div");
    wrap.className = "msg-actions";
    wrap.innerHTML = `<button class="link-btn" type="button">${ICON.copy}<span>Copiar</span></button>`;
    const btn = wrap.firstChild;
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(getText());
        btn.innerHTML = `${ICON.check}<span>Copiado</span>`;
        setTimeout(() => (btn.innerHTML = `${ICON.copy}<span>Copiar</span>`), 1500);
      } catch {}
    };
    return wrap;
  }

  // ---------- auth ----------
  async function initAuth() {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) {
        showBanner("Não foi possível iniciar a sessão. Ative \"Anonymous sign-ins\" em Authentication no painel do Supabase. (" + error.message + ")");
        throw error;
      }
      session = data.session;
    }
    state.user = session.user;
  }

  // título legível: sem extensão, sem _ e -
  const cleanTitle = (s) =>
    s.replace(/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Nova conversa";

  function groupLabel(iso) {
    const d = new Date(iso), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff <= 0) return "Hoje";
    if (diff === 1) return "Ontem";
    if (diff <= 7) return "Últimos 7 dias";
    return "Anteriores";
  }

  function metaLabel(iso) {
    const d = new Date(iso);
    const g = groupLabel(iso);
    if (g === "Hoje" || g === "Ontem") return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  }

  // ---------- conversas ----------
  async function loadConvs() {
    let q = sb.from("conversations").select("id,title,updated_at,user_id,origem").order("updated_at", { ascending: false });
    if (MODO === "atendente") {
      // Área do atendente: só as conversas que ele mesmo criou nesse modo
      q = q.eq("origem", "atendente").eq("user_id", state.user.id);
    } else {
      // Chat público: não mostra conversas de atendente criadas nesta sessão, mas mostra as compartilhadas
      q = q.or(`origem.eq.publico,user_id.neq.${state.user.id}`);
    }
    const { data, error } = await q;
    if (error) { showBanner("Erro ao carregar conversas: " + error.message); return; }
    state.convs = data;
    renderConvs();
  }
  function renderConvs() {
    el.convList.innerHTML = "";
    if (!state.convs.length) {
      el.convList.innerHTML = '<div class="empty-list">Suas conversas aparecerão aqui.</div>';
      return;
    }
    let lastGroup = "";
    for (const c of state.convs) {
      const g = groupLabel(c.updated_at);
      if (g !== lastGroup) {
        lastGroup = g;
        const h = document.createElement("div");
        h.className = "conv-group";
        h.textContent = g;
        el.convList.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "conv" + (c.id === state.currentId ? " active" : "");
      row.tabIndex = 0;
      row.innerHTML = `<span class="body"><span class="t">${esc(c.title)}</span><span class="m">${c.user_id !== state.user.id ? "Compartilhada · " : ""}${esc(metaLabel(c.updated_at))}</span></span><button class="del" title="Excluir" aria-label="Excluir conversa">${ICON.trash}</button>`;
      row.onclick = () => openConv(c.id);
      row.onkeydown = (e) => { if (e.key === "Enter" && e.target === row) openConv(c.id); };
      row.querySelector(".del").onclick = (e) => { e.stopPropagation(); deleteConv(c.id); };
      el.convList.appendChild(row);
    }
  }
  function newConv() {
    setCurrent(null);
    setReadonly(false);
    limparThumbs();
    state.pending = [];
    renderPending();
    el.messages.innerHTML = "";
    el.welcome.hidden = false;
    el.topTitle.textContent = "";
    showBanner("");
    renderConvs();
    closeMenu();
    el.input.focus();
  }
  async function openConv(id) {
    setCurrent(id);
    closeMenu();
    const conv = state.convs.find((c) => c.id === id);
    el.topTitle.textContent = conv ? conv.title : "Conversa";
    renderConvs();
    const { data, error } = await sb.from("messages").select("id,role,content,attachments").eq("conversation_id", id).order("created_at");
    if (error) { showBanner("Erro ao carregar mensagens: " + error.message); return; }
    el.messages.innerHTML = "";
    el.welcome.hidden = true;
    for (const m of data) addMessage(m.role, m.content, m.attachments, m.id);
    scrollDown();
    // Conversa de outra pessoa (compartilhada): confere se pode escrever
    if (conv && conv.user_id !== state.user.id) {
      const { data: pode } = await sb.rpc("pode_escrever_conversa", { p_conversa: id });
      setReadonly(pode !== true);
    } else {
      setReadonly(false);
    }
  }
  async function deleteConv(id) {
    const conv = state.convs.find((c) => c.id === id);
    const minha = !conv || conv.user_id === state.user.id;
    const aviso = minha
      ? "Excluir esta conversa? Esta ação não pode ser desfeita."
      : "Remover esta conversa do seu histórico? Ela continua existindo para quem a criou.";
    if (!confirm(aviso)) return;
    if (minha) {
      // apaga também os arquivos guardados desta conversa
      try {
        const { data: arqs } = await sb.storage.from("documentos").list(id);
        if (arqs?.length) await sb.storage.from("documentos").remove(arqs.map((f) => `${id}/${f.name}`));
      } catch {}
      const { error } = await sb.from("conversations").delete().eq("id", id);
      if (error) { showBanner("Erro ao excluir: " + error.message); return; }
    } else {
      const r = await callFn("conversa-codigo", { acao: "sair", conversa_id: id });
      if (!r.ok) { showBanner(r.data.error || "Não foi possível remover a conversa."); return; }
    }
    state.convs = state.convs.filter((c) => c.id !== id);
    if (state.currentId === id) newConv(); else renderConvs();
  }

  // Destaca a seção "Prazos e datas" da resposta numa caixa de alerta
  const semAcento = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function destacarPrazos(container) {
    container.querySelectorAll("h2").forEach((h) => {
      if (h.closest(".callout-prazo") || !/^\s*prazos?\b/.test(semAcento(h.textContent))) return;
      const caixa = document.createElement("section");
      caixa.className = "callout-prazo";
      h.parentNode.insertBefore(caixa, h);
      let n = h;
      while (n && !(n !== h && /^H[12]$/.test(n.tagName))) { const prox = n.nextSibling; caixa.appendChild(n); n = prox; }
      if (/nao (encontr|ha |existe|consta)/.test(semAcento(caixa.textContent))) caixa.classList.add("vazio");
    });
  }
  // Renderiza o markdown da resposta já com os prazos em destaque
  function renderResposta(container, texto) {
    container.innerHTML = renderMd(texto);
    destacarPrazos(container);
  }

  // Acrescenta abaixo da resposta: ações (ouvir, copiar, imprimir, WhatsApp), continuações, avaliação e contato.
  // A lógica fica em recursos.js; se ele não carregar, mantém só o botão Copiar.
  function finalizarResposta(wrap, texto, id) {
    if (id) wrap.dataset.id = id;
    if (window.EntendRecursos && window.EntendRecursos.decorar) window.EntendRecursos.decorar(wrap, texto, id);
    else wrap.appendChild(copyButton(() => texto));
  }

  // ---------- mensagens ----------
  function addMessage(role, content, attachments = [], id = null) {
    el.welcome.hidden = true;
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    if (role === "user") {
      let html = "";
      if (attachments?.length) {
        html += '<div class="msg-att">' + attachments.map((a) => {
          if (!a.path) return `<span class="att">${ICON.file}${esc(a.name)}</span>`; // mensagens antigas, sem arquivo guardado
          const d = `data-path="${esc(a.path)}" data-name="${esc(a.name)}"`;
          return `<span class="att att-file">
            <button type="button" class="att-open" ${d} title="Abrir arquivo">${ICON.file}<span>${esc(a.name)}</span></button>
            <button type="button" class="att-dl" ${d} aria-label="Baixar ${esc(a.name)}" title="Baixar">${ICON.download}</button>
          </span>`;
        }).join("") + "</div>";
      }
      if (content) html += `<div class="bubble">${esc(content)}</div>`;
      wrap.innerHTML = html;
    } else {
      wrap.innerHTML = '<div class="bubble md"></div>';
      renderResposta(wrap.firstChild, content);
      finalizarResposta(wrap, content, id);
    }
    el.messages.appendChild(wrap);
    return wrap;
  }

  // ---------- leitura de arquivos (tudo no navegador) ----------
  const MAX_FILES = 10;
  const CABECALHO_OCR = "[Texto obtido por leitura automática de foto ou documento escaneado; pode conter erros de leitura.]\n";

  // Painel de leitura: aparece no centro da tela e bloqueia o resto enquanto o arquivo é lido
  const Leitura = (() => {
    const raiz = $("leitura");
    if (!raiz) {
      return { abrir() {}, atualizar() {}, async concluir() {}, fechar() {}, corrida: (p) => p, get cancelado() { return false; } };
    }
    const barra = $("leituraBarra"), preench = barra.firstElementChild, pct = $("leituraPct");
    const etapaTxt = $("leituraEtapa"), arq = $("leituraArq"), dica = $("leituraDica"), titulo = $("leituraTitulo");
    const passos = [...raiz.querySelectorAll(".leitura-passos li")];
    const DICAS = [
      "Fotos nítidas e bem iluminadas geram explicações melhores.",
      "Você pode enviar várias fotos de uma vez, na ordem das páginas.",
      "Cada página pode levar alguns segundos. Obrigado pela paciência.",
      "Evite sombras e dedos na frente do texto.",
    ];
    let aberto = false, cancelado = false, rejeitar = null, cancelP = null, timer = null, iDica = 0, total = 1;
    let maxFrac = {}, maxEtapa = {};

    function mostrarDica(i) {
      dica.classList.add("troca");
      setTimeout(() => { dica.textContent = DICAS[i % DICAS.length]; dica.classList.remove("troca"); }, 250);
    }
    function abrir(n) {
      total = Math.max(1, n); cancelado = false; maxFrac = {}; maxEtapa = {}; iDica = 0; aberto = true;
      cancelP = new Promise((_, rej) => { rejeitar = rej; });
      cancelP.catch(() => {});
      titulo.textContent = total > 1 ? "Lendo os seus documentos" : "Lendo o seu documento";
      dica.textContent = DICAS[0];
      preench.style.width = "0%"; pct.textContent = "0%"; barra.setAttribute("aria-valuenow", "0");
      passos.forEach((li) => (li.className = ""));
      etapaTxt.textContent = "Preparando...";
      arq.textContent = "";
      raiz.hidden = false;
      el.app.inert = true;
      timer = setInterval(() => mostrarDica(++iDica), 5500);
      $("leituraCancelar").focus();
    }
    function atualizar({ i, nome, etapa, frac, msg }) {
      if (!aberto) return;
      maxFrac[i] = Math.max(maxFrac[i] || 0, frac || 0);
      maxEtapa[i] = Math.max(maxEtapa[i] || 1, etapa || 1);
      const geral = Math.min(((i - 1) + maxFrac[i]) / total, 0.99) * 100;
      preench.style.width = geral.toFixed(1) + "%";
      pct.textContent = Math.round(geral) + "%";
      barra.setAttribute("aria-valuenow", String(Math.round(geral)));
      arq.textContent = total > 1 ? `Arquivo ${i} de ${total}: ${nome}` : nome;
      if (msg) etapaTxt.textContent = msg;
      passos.forEach((li, k) => { li.className = k + 1 < maxEtapa[i] ? "feito" : k + 1 === maxEtapa[i] ? "ativo" : ""; });
    }
    async function concluir() {
      if (!aberto || cancelado) return;
      preench.style.width = "100%"; pct.textContent = "100%"; barra.setAttribute("aria-valuenow", "100");
      etapaTxt.textContent = "Pronto!";
      passos.forEach((li) => (li.className = "feito"));
      await new Promise((r) => setTimeout(r, 500));
    }
    function fechar() {
      aberto = false;
      clearInterval(timer);
      raiz.hidden = true;
      el.app.inert = false;
    }
    $("leituraCancelar").onclick = () => {
      cancelado = true;
      if (rejeitar) rejeitar(new Error("cancelado"));
      encerrarOcr();
    };
    return {
      abrir, atualizar, concluir, fechar,
      corrida: (p) => Promise.race([p, cancelP]),   // interrompe a espera se a pessoa cancelar
      get cancelado() { return cancelado; },
    };
  })();
  const verificarCancelado = () => { if (Leitura.cancelado) throw new Error("cancelado"); };

  // ----- leitor de texto de imagens (Tesseract), reaproveitado entre as páginas/fotos do mesmo envio
  let ocrWorker = null;
  let ocrAoProgresso = () => {};
  const ETAPAS_OCR = {
    "loading tesseract core": [0.12, 0.18],
    "initializing tesseract": [0.18, 0.22],
    "loading language traineddata": [0.22, 0.32],
    "initializing api": [0.32, 0.34],
  };
  async function obterOcr() {
    if (ocrWorker) return ocrWorker;
    const w = await Tesseract.createWorker("por", 1, { logger: (m) => ocrAoProgresso(m) });
    try { await w.setParameters({ preserve_interword_spaces: "1" }); } catch {}
    ocrWorker = w;
    return w;
  }
  async function encerrarOcr() {
    if (!ocrWorker) return;
    const w = ocrWorker;
    ocrWorker = null;
    try { await w.terminate(); } catch {}
  }

  // ----- preparo da imagem: orientação, tamanho, tons de cinza, contraste e luz irregular
  async function paraCanvas(fonte) {
    if (fonte instanceof HTMLCanvasElement) return fonte;
    let bmp;
    try {
      bmp = await createImageBitmap(fonte, { imageOrientation: "from-image" });   // respeita foto de celular girada
    } catch {
      bmp = await new Promise((ok, falha) => {
        const url = URL.createObjectURL(fonte), im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); ok(im); };
        im.onerror = () => { URL.revokeObjectURL(url); falha(new Error("img")); };
        im.src = url;
      });
    }
    const c = document.createElement("canvas");
    c.width = bmp.width || bmp.naturalWidth; c.height = bmp.height || bmp.naturalHeight;
    c.getContext("2d").drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return c;
  }
  // Limiar adaptativo (método de Bradley): separa letra e papel mesmo com sombra ou luz desigual
  function limiarAdaptativo(g, w, h) {
    const W = w + 1;
    const integral = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let linha = 0;
      for (let x = 0; x < w; x++) { linha += g[y * w + x]; integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + linha; }
    }
    const s = Math.max(12, ((Math.min(w, h) / 16) | 0) >> 1);
    const t = 0.15;
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - s), y1 = Math.min(h - 1, y + s);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - s), x1 = Math.min(w - 1, x + s);
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const soma = integral[(y1 + 1) * W + x1 + 1] - integral[y0 * W + x1 + 1] - integral[(y1 + 1) * W + x0] + integral[y0 * W + x0];
        out[y * w + x] = g[y * w + x] * n < soma * (1 - t) ? 0 : 255;
      }
    }
    return out;
  }
  async function prepararImagem(fonte, { binarizar = true } = {}) {
    const origem = await paraCanvas(fonte);
    const maior = Math.max(origem.width, origem.height);
    let escala = 1;
    if (maior > 2800) escala = 2800 / maior;                              // fotos enormes: reduz (mais rápido)
    else if (maior < 1800) escala = Math.min(2, 1800 / maior);            // imagens pequenas: amplia
    const w = Math.max(1, Math.round(origem.width * escala)), h = Math.max(1, Math.round(origem.height * escala));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(origem, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const cinza = new Uint8ClampedArray(w * h), hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const g = ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000) | 0;
      cinza[p] = g; hist[g]++;
    }
    // estica o contraste ignorando 1% dos tons mais escuros e mais claros
    const tot = w * h;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= tot * 0.01) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= tot * 0.01) { hi = v; break; } }
    if (hi - lo < 30) { lo = 0; hi = 255; }
    const fator = 255 / (hi - lo);
    for (let p = 0; p < cinza.length; p++) cinza[p] = Math.max(0, Math.min(255, (cinza[p] - lo) * fator));
    const saida = binarizar ? limiarAdaptativo(cinza, w, h) : cinza;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = saida[p]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  // Limpa ruído típico de leitura automática (linhas de símbolos soltos, hifenização)
  function limparTextoOcr(t) {
    return t
      .replace(/-\n(?=\p{Ll})/gu, "")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter((l) => {
        if (!l) return true;
        const alnum = (l.match(/[\p{L}\p{N}]/gu) || []).length;
        return alnum >= 2 && alnum / l.length >= 0.3;
      })
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function ocrImagem(fonte, prog, { binarizar = true, faixa = [0.35, 0.95], rotulo = "Reconhecendo as letras..." } = {}) {
    prog.set(1, 0.03, "Preparando a imagem...");
    await Leitura.corrida(carregarLib("tesseract"));
    verificarCancelado();
    prog.set(1, 0.08, "Melhorando a imagem para a leitura...");
    const canvas = await prepararImagem(fonte, { binarizar });
    verificarCancelado();
    prog.set(1, 0.12, "Preparando o leitor de textos...");
    ocrAoProgresso = (m) => {
      if (m.status === "recognizing text") {
        prog.set(2, faixa[0] + (faixa[1] - faixa[0]) * (m.progress || 0), rotulo);
      } else if (ETAPAS_OCR[m.status]) {
        const [a, b] = ETAPAS_OCR[m.status];
        prog.set(1, a + (b - a) * (m.progress || 0), "Preparando o leitor de textos...");
      }
    };
    const worker = await Leitura.corrida(obterOcr());
    verificarCancelado();
    prog.set(2, faixa[0], rotulo);
    const { data } = await Leitura.corrida(worker.recognize(canvas));
    return { text: limparTextoOcr(data.text || ""), conf: typeof data.confidence === "number" ? data.confidence : 0 };
  }

  async function lerPdf(file, prog) {
    prog.set(1, 0.03, "Preparando o leitor de documentos...");
    await Leitura.corrida(carregarLib("pdfjs"));
    verificarCancelado();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    prog.set(1, 0.1, "Abrindo o documento...");
    const pdf = await Leitura.corrida(pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise);
    let texto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      verificarCancelado();
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      texto += content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join(" ") + "\n\n";
      prog.set(2, 0.1 + 0.2 * (i / pdf.numPages), `Lendo a página ${i} de ${pdf.numPages}...`);
    }
    if (texto.replace(/\s/g, "").length > 80 * Math.min(pdf.numPages, 3)) {
      prog.set(3, 0.97, "Organizando o texto...");
      return { text: texto.trim(), ocr: false };
    }
    // PDF escaneado: leitura página a página
    const paginas = Math.min(pdf.numPages, MAX_OCR_PAGES);
    let ocr = "", somaConf = 0;
    for (let i = 1; i <= paginas; i++) {
      verificarCancelado();
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const r = await ocrImagem(canvas, prog, {
        binarizar: false,
        faixa: [0.3 + 0.65 * ((i - 1) / paginas), 0.3 + 0.65 * (i / paginas)],
        rotulo: `Lendo a página ${i} de ${paginas} (documento escaneado)...`,
      });
      ocr += r.text + "\n\n";
      somaConf += r.conf;
    }
    if (pdf.numPages > paginas) ocr += `\n[Apenas as primeiras ${paginas} páginas de ${pdf.numPages} foram lidas.]`;
    return { text: ocr.trim(), ocr: true, conf: somaConf / paginas };
  }

  async function extrairTexto(file, prog) {
    const e = ext(file.name);
    if (e === "txt" || e === "md") return { text: await file.text(), ocr: false };
    if (e === "docx") {
      await carregarLib("mammoth");
      return { text: (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value, ocr: false };
    }
    if (e === "pdf") return lerPdf(file, prog);
    if (["png", "jpg", "jpeg", "webp"].includes(e)) {
      const r = await ocrImagem(file, prog);
      prog.set(3, 0.97, "Organizando o texto...");
      return { ...r, ocr: true };
    }
    throw new Error("unsupported");
  }

  async function addFiles(fileList) {
    if (state.readonly) return;
    const validos = [];
    for (const file of fileList) {
      if (state.pending.length + validos.length >= MAX_FILES) { showBanner(`Máximo de ${MAX_FILES} arquivos por mensagem.`); break; }
      if (file.size > MAX_BYTES) { showBanner(`"${file.name}" passa de ${MAX_FILE_MB} MB.`); continue; }
      validos.push(file);
    }
    if (!validos.length) return;

    const pesado = validos.some((f) => ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext(f.name)));
    setBusy(true);
    if (pesado) Leitura.abrir(validos.length);
    let lidos = 0, baixaQualidade = 0, cancelou = false;
    try {
      for (let i = 0; i < validos.length; i++) {
        if (Leitura.cancelado) { cancelou = true; break; }
        const file = validos[i];
        const prog = { set: (etapa, frac, msg) => Leitura.atualizar({ i: i + 1, nome: file.name, etapa, frac, msg }) };
        prog.set(1, 0.01, "Preparando...");
        try {
          const r = await extrairTexto(file, prog);
          const texto = (r.text || "").trim();
          if (texto.replace(/\s/g, "").length < (r.ocr ? 25 : 1)) {
            showBanner(`Não consegui ler o texto de "${file.name}". Tire uma nova foto com mais luz, mostrando a página inteira, ou cole o texto na caixa de mensagem.`);
            continue;
          }
          if (r.ocr && r.conf < 55) baixaQualidade++;
          state.pending.push({
            name: file.name, file, mime: file.type || mimePorExtensao(file.name),
            text: r.ocr ? CABECALHO_OCR + texto : texto,
            thumb: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          });
          lidos++;
        } catch (err) {
          if (err.message === "cancelado") { cancelou = true; break; }
          showBanner(err.message === "unsupported"
            ? `Formato não suportado: ${file.name}. Use PDF, imagem, Word (.docx) ou texto.`
            : err.message === "lib"
              ? "Não consegui carregar o leitor de arquivos. Verifique sua internet e tente de novo."
              : `Não consegui ler "${file.name}". Tente outro arquivo, uma foto mais nítida ou cole o texto.`);
        }
      }
      if (pesado && !cancelou) await Leitura.concluir();
    } finally {
      await encerrarOcr();
      Leitura.fechar();
      setBusy(false);
      renderPending();
    }
    if (cancelou) showBanner("Leitura cancelada.", false);
    else if (lidos && baixaQualidade) showBanner("A leitura de algumas fotos ficou com qualidade baixa. Se a explicação vier estranha, tire outra foto com mais luz e sem sombra.", false);
    else if (lidos) showBanner("");
  }

  const limparThumbs = () => state.pending.forEach((f) => f.thumb && URL.revokeObjectURL(f.thumb));
  function moverPendente(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= state.pending.length) return;
    [state.pending[i], state.pending[j]] = [state.pending[j], state.pending[i]];
    renderPending();
  }
  function renderPending() {
    el.files.innerHTML = "";
    el.btnSend.classList.toggle("pulsa", state.pending.length > 0);
    const varios = state.pending.length > 1;
    state.pending.forEach((f, i) => {
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.innerHTML =
        (varios ? `<span class="file-num">${i + 1}</span>` : "") +
        (f.thumb ? `<img class="file-thumb" src="${f.thumb}" alt="">` : ICON.file) +
        `<span class="file-nome">${esc(f.name)}</span>` +
        (varios
          ? `<button type="button" class="mv" data-d="-1" aria-label="Mover ${esc(f.name)} para antes" ${i === 0 ? "disabled" : ""}>${ICON.esq}</button>` +
            `<button type="button" class="mv" data-d="1" aria-label="Mover ${esc(f.name)} para depois" ${i === state.pending.length - 1 ? "disabled" : ""}>${ICON.dir}</button>`
          : "") +
        `<button type="button" class="x" aria-label="Remover ${esc(f.name)}">${ICON.close}</button>`;
      chip.querySelectorAll(".mv").forEach((b) => { b.onclick = () => moverPendente(i, Number(b.dataset.d)); });
      chip.querySelector(".x").onclick = () => {
        if (f.thumb) URL.revokeObjectURL(f.thumb);
        state.pending.splice(i, 1);
        renderPending();
      };
      el.files.appendChild(chip);
    });
    if (state.pending.length) {
      const dica = document.createElement("span");
      dica.className = "hint-enviar";
      dica.textContent = varios
        ? `Pronto! ${state.pending.length} arquivos, na ordem mostrada. Toque na seta azul para enviar.`
        : "Pronto! Agora toque na seta azul para enviar.";
      el.files.appendChild(dica);
    }
  }

  // Título da conversa quando a pessoa envia só arquivos
  function tituloDosArquivos(lista) {
    const n = lista.length;
    if (lista.every((f) => /^foto-/i.test(f.name))) return n > 1 ? `Documento fotografado (${n} fotos)` : "Documento fotografado";
    const base = cleanTitle(lista[0].name);
    return n > 1 ? `${base} e mais ${n - 1}`.slice(0, 60) : base;
  }

  // Painel "Enviando seus arquivos": mostra o andamento do envio (upload) e bloqueia a tela
  const Envio = (() => {
    const raiz = $("envioPainel");
    if (!raiz) return { abrir() {}, atualizar() {}, fechar() {} };
    const barra = $("envioBarra"), etapa = $("envioEtapa"), arq = $("envioArq");
    let aberto = false;
    return {
      abrir() {
        aberto = true;
        barra.style.width = "6%"; etapa.textContent = "Preparando o envio..."; arq.textContent = "";
        raiz.hidden = false;
        el.app.inert = true;
      },
      atualizar(pct, msg, nome) {
        if (!aberto) return;
        barra.style.width = Math.max(6, Math.min(100, pct)) + "%";
        if (msg) etapa.textContent = msg;
        if (nome !== undefined) arq.textContent = nome;
      },
      fechar() { aberto = false; raiz.hidden = true; el.app.inert = false; },
    };
  })();

  // Executa fn em todos os itens com no máximo "limite" ao mesmo tempo; o resultado mantém a ordem original
  async function paraleloLimitado(itens, limite, fn) {
    const res = new Array(itens.length);
    let prox = 0;
    await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (prox < itens.length) { const i = prox++; res[i] = await fn(itens[i], i); }
    }));
    return res;
  }

  // ---------- envio ----------
  async function send() {
    if (state.busy || state.readonly) return;
    const content = el.input.value.trim();
    if (!content && !state.pending.length) return;
    // Primeiro uso (chat público): aviso de privacidade em linguagem simples
    if (window.EntendRecursos && window.EntendRecursos.garantirPrivacidade) {
      if (!(await window.EntendRecursos.garantirPrivacidade())) return;
    }
    setBusy(true);
    showBanner("");
    if (state.pending.length) Envio.abrir();      // feedback imediato: o envio dos arquivos pode demorar

    let assistantWrap = null;
    let timersEspera = [];

    // O texto vai aparecendo SEM "descer" a tela: o início da resposta fica fixo no topo
    // e a tela só se move se a pessoa rolar.
    let usuarioRolou = false, inicioFixo = false;
    const aoRolar = () => { usuarioRolou = true; };
    const EVENTOS_ROLAGEM = ["wheel", "touchmove", "pointerdown"];
    EVENTOS_ROLAGEM.forEach((ev) => el.chat.addEventListener(ev, aoRolar, { passive: true }));
    const fixarInicio = () => {
      if (usuarioRolou || inicioFixo || !assistantWrap) return;
      assistantWrap.scrollIntoView({ block: "start", behavior: "instant" });
      const folga = assistantWrap.getBoundingClientRect().top - el.chat.getBoundingClientRect().top;
      if (folga <= 30) inicioFixo = true;   // o início da resposta chegou ao topo: não mexe mais
    };
    try {
      let convId = state.currentId;
      if (!convId) {
        const title = content ? cleanTitle(content) : tituloDosArquivos(state.pending);
        // No modo atendente a origem é 'atendente'; o nome do atendente é preenchido pelo banco.
        const { data, error } = await sb.from("conversations")
          .insert({ title, origem: MODO === "atendente" ? "atendente" : "publico" })
          .select("id,title,updated_at,user_id,origem").single();
        if (error) throw new Error("Não foi possível criar a conversa: " + error.message);
        convId = data.id;
        setCurrent(convId);
        state.convs.unshift(data);
        el.topTitle.textContent = data.title;
        renderConvs();
      }

      // Guarda o arquivo original (para abrir/baixar depois). Se falhar, segue só com o texto.
      // Envia até 3 por vez e mostra o andamento; a ordem dos anexos é mantida.
      let falhouGuardar = false;
      const totalArq = state.pending.length;
      let enviados = 0;
      Envio.atualizar(10, totalArq ? "Conversa pronta. Enviando os arquivos..." : "");
      const attachments = await paraleloLimitado(state.pending, 3, async (f) => {
        const a = { name: f.name, text: f.text };
        const path = `${convId}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error } = await sb.storage.from("documentos").upload(path, f.file, { contentType: f.mime });
        if (error) { falhouGuardar = true; console.warn("upload", error.message); }
        else { a.path = path; a.mime = f.mime; a.size = f.file.size; }
        enviados++;
        Envio.atualizar(10 + (80 * enviados) / totalArq, `Enviando arquivo ${enviados} de ${totalArq}...`, f.name);
        return a;
      });
      if (falhouGuardar) showBanner("A análise foi feita, mas o arquivo original não pôde ser guardado para download.", false);
      Envio.atualizar(96, "Iniciando a conversa...");

      addMessage("user", content, attachments);
      Envio.fechar();
      el.input.value = "";
      autoGrow();
      limparThumbs();
      state.pending = [];
      renderPending();

      assistantWrap = document.createElement("div");
      assistantWrap.className = "msg assistant";
      const temArquivo = attachments.length > 0;
      assistantWrap.innerHTML = '<div class="bubble md"><span class="status" role="status"><span class="dots"><i></i><i></i><i></i></span><span class="status-txt"></span></span></div>';
      el.messages.appendChild(assistantWrap);
      const bubble = assistantWrap.firstChild;
      const statusTxt = bubble.querySelector(".status-txt");
      statusTxt.textContent = temArquivo ? "Estou lendo o seu documento. Pode levar até 1 minuto." : "Estou preparando a resposta...";
      timersEspera = [
        setTimeout(() => { statusTxt.textContent = "Quase lá. Estou organizando a explicação..."; }, 12000),
        setTimeout(() => { statusTxt.textContent = "Está demorando um pouco mais que o normal. Obrigado pela paciência."; }, 35000),
      ];
      scrollDown();

      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ conversation_id: convId, content, attachments }),
      });

      if (!res.ok) {
        let msg = "Erro ao processar sua mensagem.";
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "", failed = null, idResposta = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          if (!p.startsWith("data:")) continue;
          const ev = JSON.parse(p.slice(5));
          if (ev.t === "delta") {
            if (!full) timersEspera.forEach(clearTimeout);
            full += ev.text;
            renderResposta(bubble, full);
            fixarInicio();
          } else if (ev.t === "done") {
            idResposta = ev.id || null;
            if (ev.title) {
              const c = state.convs.find((x) => x.id === convId);
              if (c) { c.title = ev.title; el.topTitle.textContent = ev.title; }
            }
          } else if (ev.t === "error") {
            failed = ev.message;
          }
        }
      }
      timersEspera.forEach(clearTimeout);
      if (failed) showBanner(failed + (MODO === "atendente" ? "" : CONTATO_AJUDA));

      const idx = state.convs.findIndex((c) => c.id === convId);
      if (idx > 0) state.convs.unshift(...state.convs.splice(idx, 1));
      renderConvs();
      if (full) finalizarResposta(assistantWrap, full, idResposta);
    } catch (err) {
      timersEspera.forEach(clearTimeout);
      if (assistantWrap) assistantWrap.remove();
      showBanner(erroAmigavel(err));
    } finally {
      Envio.fechar();
      EVENTOS_ROLAGEM.forEach((ev) => el.chat.removeEventListener(ev, aoRolar));
      setBusy(false);
      el.input.focus();
    }
  }

  // Envia um texto pronto (usado pelos botões de continuação)
  function enviarTexto(texto) {
    if (state.busy || state.readonly) return;
    el.input.value = texto;
    autoGrow();
    send();
  }

  // ---------- menu mobile ----------
  function closeMenu() { el.app.classList.remove("menu-open"); }

  // ---------- eventos ----------
  el.composer.addEventListener("submit", (e) => { e.preventDefault(); send(); });
  el.input.addEventListener("input", autoGrow);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  // Abrir (nova aba) ou baixar um arquivo anexado, por link assinado de curta duração
  el.messages.addEventListener("click", async (e) => {
    const btn = e.target.closest(".att-open, .att-dl");
    if (!btn) return;
    const { path, name } = btn.dataset;
    const baixar = btn.classList.contains("att-dl");
    const aba = baixar ? null : window.open("", "_blank"); // abre antes do await para não ser bloqueada
    const { data, error } = await sb.storage.from("documentos")
      .createSignedUrl(path, 120, baixar ? { download: name } : undefined);
    if (error || !data?.signedUrl) {
      aba?.close();
      showBanner("Não foi possível abrir o arquivo. Ele pode ter sido removido ou o acesso foi encerrado.");
      return;
    }
    if (baixar) {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    } else if (aba) {
      aba.location.href = data.signedUrl;
    } else {
      window.open(data.signedUrl, "_blank");
    }
  });
  el.btnNew.onclick = newConv;
  el.btnAttach.onclick = () => el.fileInput.click();
  el.fileInput.onchange = () => { addFiles([...el.fileInput.files]); el.fileInput.value = ""; };
  const isMobile = () => window.matchMedia("(max-width: 800px)").matches;
  try { if (localStorage.getItem("sideCollapsed") === "1") el.app.classList.add("side-collapsed"); } catch {}
  el.btnMenu.onclick = () => {
    if (isMobile()) { el.app.classList.toggle("menu-open"); return; }
    const c = el.app.classList.toggle("side-collapsed");
    try { localStorage.setItem("sideCollapsed", c ? "1" : "0"); } catch {}
  };
  el.backdrop.onclick = closeMenu;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  document.querySelectorAll(".starter").forEach((c) => {
    c.onclick = () => { el.input.value = c.dataset.prompt; autoGrow(); el.input.focus(); };
  });

  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; el.dropzone.hidden = false; } });
  window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) el.dropzone.hidden = true; });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; el.dropzone.hidden = true;
    if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]);
  });

  // ---------- início ----------
  // API usada pelos módulos extras (atendente.js e codigo.js)
  window.EntendApp = { MODO, sb, state, el, ICON, esc, showBanner, callFn, initAuth, loadConvs, openConv, newConv, send, addFiles, copyButton, renderMd, enviarTexto, autoGrow, MAX_FILES };

  // No modo atendente, quem inicia é o atendente.js (depois do login).
  if (MODO !== "atendente") {
    (async () => {
      try {
        await initAuth();
        await loadConvs();
      } catch (e) { console.error(e); }
    })();
  }
})();
