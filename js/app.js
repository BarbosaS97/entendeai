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
  };

  const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
  const MAX_OCR_PAGES = 12;
  // "publico" (padrão) ou "atendente" (definido no <body data-modo="atendente">)
  const MODO = document.body.dataset.modo || "publico";
  // Texto do campo: versão curta no celular, para não ser cortado
  const mqCelular = window.matchMedia("(max-width: 800px)");
  const PH_DESKTOP = el.input.placeholder, PH_CELULAR = "Digite ou anexe um documento";
  const PLACEHOLDER_ATUAL = () => (mqCelular.matches ? PH_CELULAR : PH_DESKTOP);
  el.input.placeholder = PLACEHOLDER_ATUAL();
  mqCelular.addEventListener("change", () => { if (!state.readonly) el.input.placeholder = PLACEHOLDER_ATUAL(); });
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
    const { data, error } = await sb.from("messages").select("role,content,attachments").eq("conversation_id", id).order("created_at");
    if (error) { showBanner("Erro ao carregar mensagens: " + error.message); return; }
    el.messages.innerHTML = "";
    el.welcome.hidden = true;
    for (const m of data) addMessage(m.role, m.content, m.attachments);
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

  // Lembrete de contato do atendimento (aparece só abaixo da última resposta; não no modo atendente)
  function contatoLembrete() {
    if (MODO === "atendente") return null;
    const d = document.createElement("div");
    d.className = "msg-contato";
    d.innerHTML = 'Ficou com dúvida? Fale com o atendimento: <a href="tel:+556132216600">(61) 3221-6600</a> · <a href="tel:+556132216601">3221-6601</a> · <a href="mailto:seate.df@trf1.jus.br">seate.df@trf1.jus.br</a>';
    return d;
  }

  // ---------- mensagens ----------
  function addMessage(role, content, attachments = []) {
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
      wrap.innerHTML = `<div class="bubble md">${renderMd(content)}</div>`;
      wrap.appendChild(copyButton(() => content));
      const lembrete = contatoLembrete(); if (lembrete) wrap.appendChild(lembrete);
    }
    el.messages.appendChild(wrap);
    return wrap;
  }

  // ---------- leitura de arquivos (tudo no navegador) ----------
  async function ocrImage(source, onProgress) {
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); },
    });
    try {
      const { data } = await worker.recognize(source);
      return data.text;
    } finally {
      await worker.terminate();
    }
  }

  async function readPdf(file, status) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join(" ") + "\n\n";
    }
    if (text.replace(/\s/g, "").length > 80 * Math.min(pdf.numPages, 3)) return text.trim();

    // PDF escaneado: OCR página a página
    const pages = Math.min(pdf.numPages, MAX_OCR_PAGES);
    let ocr = "";
    for (let i = 1; i <= pages; i++) {
      status(`Lendo página ${i} de ${pages} (documento escaneado)...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      ocr += (await ocrImage(canvas)) + "\n\n";
    }
    if (pdf.numPages > pages) ocr += `\n[Apenas as primeiras ${pages} páginas de ${pdf.numPages} foram lidas.]`;
    return ocr.trim();
  }

  async function extractText(file, status) {
    const e = ext(file.name);
    if (e === "txt" || e === "md") return file.text();
    if (e === "docx") return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    if (e === "pdf") return readPdf(file, status);
    if (["png", "jpg", "jpeg", "webp"].includes(e)) {
      status("Lendo o texto da imagem...");
      return ocrImage(file, (p) => status(`Lendo o texto da imagem... ${Math.round(p * 100)}%`));
    }
    throw new Error("unsupported");
  }

  async function addFiles(fileList) {
    if (state.readonly) return;
    for (const file of fileList) {
      if (state.pending.length >= 5) { showBanner("Máximo de 5 arquivos por mensagem."); break; }
      if (file.size > MAX_BYTES) { showBanner(`"${file.name}" passa de ${MAX_FILE_MB} MB.`); continue; }
      setBusy(true);
      try {
        const text = (await extractText(file, (s) => showBanner(s, false))).trim();
        if (!text) { showBanner(`Não encontrei texto legível em "${file.name}". Tente uma imagem mais nítida ou cole o texto.`); continue; }
        state.pending.push({ name: file.name, text, file, mime: file.type || mimePorExtensao(file.name) });
        showBanner("");
      } catch (err) {
        showBanner(err.message === "unsupported"
          ? `Formato não suportado: ${file.name}. Use PDF, imagem, Word (.docx) ou texto.`
          : `Não consegui ler "${file.name}".`);
      } finally {
        setBusy(false);
      }
    }
    renderPending();
  }
  function renderPending() {
    el.files.innerHTML = "";
    state.pending.forEach((f, i) => {
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.innerHTML = `${ICON.file}${esc(f.name)}<button type="button" class="x" aria-label="Remover ${esc(f.name)}">${ICON.close}</button>`;
      chip.querySelector(".x").onclick = () => { state.pending.splice(i, 1); renderPending(); };
      el.files.appendChild(chip);
    });
  }

  // ---------- envio ----------
  async function send() {
    if (state.busy || state.readonly) return;
    const content = el.input.value.trim();
    if (!content && !state.pending.length) return;
    setBusy(true);
    showBanner("");

    let assistantWrap = null;
    try {
      let convId = state.currentId;
      if (!convId) {
        const title = cleanTitle(content || state.pending[0].name);
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
      const attachments = [];
      let falhouGuardar = false;
      for (const f of state.pending) {
        const a = { name: f.name, text: f.text };
        const path = `${convId}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const { error } = await sb.storage.from("documentos").upload(path, f.file, { contentType: f.mime });
        if (error) { falhouGuardar = true; console.warn("upload", error.message); }
        else { a.path = path; a.mime = f.mime; a.size = f.file.size; }
        attachments.push(a);
      }
      if (falhouGuardar) showBanner("A análise foi feita, mas o arquivo original não pôde ser guardado para download.", false);

      addMessage("user", content, attachments);
      el.input.value = "";
      autoGrow();
      state.pending = [];
      renderPending();

      assistantWrap = document.createElement("div");
      assistantWrap.className = "msg assistant";
      assistantWrap.innerHTML = '<div class="bubble md"><span class="status"><span class="dots"><i></i><i></i><i></i></span>Analisando o texto</span></div>';
      el.messages.appendChild(assistantWrap);
      const bubble = assistantWrap.firstChild;
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
      let buf = "", full = "", failed = null;
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
            full += ev.text;
            bubble.innerHTML = renderMd(full);
            scrollDown();
          } else if (ev.t === "done") {
            if (ev.title) {
              const c = state.convs.find((x) => x.id === convId);
              if (c) { c.title = ev.title; el.topTitle.textContent = ev.title; }
            }
          } else if (ev.t === "error") {
            failed = ev.message;
          }
        }
      }
      if (failed) showBanner(failed);

      const idx = state.convs.findIndex((c) => c.id === convId);
      if (idx > 0) state.convs.unshift(...state.convs.splice(idx, 1));
      renderConvs();
      if (full) {
        assistantWrap.appendChild(copyButton(() => full));
        const lembrete = contatoLembrete(); if (lembrete) assistantWrap.appendChild(lembrete);
      }
    } catch (err) {
      if (assistantWrap) assistantWrap.remove();
      showBanner(err.message || "Algo deu errado.");
    } finally {
      setBusy(false);
      el.input.focus();
    }
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
  window.EntendApp = { MODO, sb, state, el, ICON, esc, showBanner, callFn, initAuth, loadConvs, openConv, newConv };

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
