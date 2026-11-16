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
  };

  const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
  const MAX_OCR_PAGES = 12;
  const state = { user: null, convs: [], currentId: null, pending: [], busy: false };

  // ---------- util ----------
  const ext = (n) => (n.split(".").pop() || "").toLowerCase();
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
  function setBusy(b) { state.busy = b; el.btnSend.disabled = b; }

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
    const { data, error } = await sb.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false });
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
      row.innerHTML = `<span class="body"><span class="t">${esc(c.title)}</span><span class="m">${esc(metaLabel(c.updated_at))}</span></span><button class="del" title="Excluir" aria-label="Excluir conversa">${ICON.trash}</button>`;
      row.onclick = () => openConv(c.id);
      row.onkeydown = (e) => { if (e.key === "Enter" && e.target === row) openConv(c.id); };
      row.querySelector(".del").onclick = (e) => { e.stopPropagation(); deleteConv(c.id); };
      el.convList.appendChild(row);
    }
  }
  function newConv() {
    state.currentId = null;
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
    state.currentId = id;
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
  }
  async function deleteConv(id) {
    if (!confirm("Excluir esta conversa? Esta ação não pode ser desfeita.")) return;
    const { error } = await sb.from("conversations").delete().eq("id", id);
    if (error) { showBanner("Erro ao excluir: " + error.message); return; }
    state.convs = state.convs.filter((c) => c.id !== id);
    if (state.currentId === id) newConv(); else renderConvs();
  }

  // ---------- mensagens ----------
  function addMessage(role, content, attachments = []) {
    el.welcome.hidden = true;
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    if (role === "user") {
      let html = "";
      if (attachments?.length) {
        html += '<div class="msg-att">' + attachments.map((a) => `<span class="att">${ICON.file}${esc(a.name)}</span>`).join("") + "</div>";
      }
      if (content) html += `<div class="bubble">${esc(content)}</div>`;
      wrap.innerHTML = html;
    } else {
      wrap.innerHTML = `<div class="bubble md">${renderMd(content)}</div>`;
      wrap.appendChild(copyButton(() => content));
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
    for (const file of fileList) {
      if (state.pending.length >= 5) { showBanner("Máximo de 5 arquivos por mensagem."); break; }
      if (file.size > MAX_BYTES) { showBanner(`"${file.name}" passa de ${MAX_FILE_MB} MB.`); continue; }
      setBusy(true);
      try {
        const text = (await extractText(file, (s) => showBanner(s, false))).trim();
        if (!text) { showBanner(`Não encontrei texto legível em "${file.name}". Tente uma imagem mais nítida ou cole o texto.`); continue; }
        state.pending.push({ name: file.name, text });
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
    if (state.busy) return;
    const content = el.input.value.trim();
    if (!content && !state.pending.length) return;
    setBusy(true);
    showBanner("");

    let assistantWrap = null;
    try {
      let convId = state.currentId;
      const attachments = state.pending.map((f) => ({ name: f.name, text: f.text }));

      if (!convId) {
        const title = cleanTitle(content || attachments[0].name);
        const { data, error } = await sb.from("conversations").insert({ title }).select("id,title,updated_at").single();
        if (error) throw new Error("Não foi possível criar a conversa: " + error.message);
        convId = data.id;
        state.currentId = convId;
        state.convs.unshift(data);
        el.topTitle.textContent = data.title;
        renderConvs();
      }

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
      if (full) assistantWrap.appendChild(copyButton(() => full));
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
  (async () => {
    try {
      await initAuth();
      await loadConvs();
    } catch (e) { console.error(e); }
  })();
})();
