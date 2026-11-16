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
  // 2) Ouvir a resposta (leitura em voz alta pelo navegador)
  // =====================================================================
  const temVoz = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let leitura = { id: 0, btn: null };

  function resetarBotaoOuvir(btn) {
    if (!btn) return;
    btn.classList.remove("ativo");
    btn.innerHTML = `${I.ouvir}<span>Ouvir</span>`;
  }
  function pararLeitura() {
    if (!temVoz) return;
    leitura.id++;                       // invalida callbacks da leitura anterior
    speechSynthesis.cancel();
    resetarBotaoOuvir(leitura.btn);
    leitura.btn = null;
  }
  // Divide em trechos curtos (alguns navegadores cortam falas longas)
  function dividirTexto(texto, max = 220) {
    const frases = texto.replace(/\s+/g, " ").match(/[^.!?:;]+[.!?:;]*\s*/g) || [texto];
    const partes = [];
    let atual = "";
    for (const f of frases) {
      if ((atual + f).length > max && atual) { partes.push(atual.trim()); atual = ""; }
      atual += f;
    }
    if (atual.trim()) partes.push(atual.trim());
    return partes;
  }
  function falar(texto, btn) {
    if (leitura.btn === btn) { pararLeitura(); return; }   // segundo toque = parar
    pararLeitura();
    const meuId = ++leitura.id;
    leitura.btn = btn;
    btn.classList.add("ativo");
    btn.innerHTML = `${I.parar}<span>Parar</span>`;
    const voz = speechSynthesis.getVoices().find((v) => /^pt[-_]BR/i.test(v.lang)) ||
      speechSynthesis.getVoices().find((v) => /^pt/i.test(v.lang));
    const partes = dividirTexto(texto);
    const fim = () => { if (leitura.id === meuId) { resetarBotaoOuvir(btn); leitura.btn = null; } };
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = "pt-BR";
      if (voz) u.voice = voz;
      u.rate = 0.95;
      u.onerror = fim;
      if (i === partes.length - 1) u.onend = fim;
      speechSynthesis.speak(u);
    });
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
  const SEGUIR = [
    ["Explicar mais simples", "Explique de novo de um jeito ainda mais simples, com frases bem curtas."],
    ["Quais são os prazos?", "Quais são os prazos e datas importantes neste documento?"],
    ["Palavras difíceis", "Explique as palavras difíceis que aparecem neste documento."],
    ["O que vem agora?", "O que o documento indica que vai acontecer ou que precisa ser feito agora?"],
  ];
  const LINHA_CONTATO =
    'Ficou com dúvida? Fale com o atendimento: <a href="tel:+556132216600">(61) 3221-6600</a> · <a href="tel:+556132216601">3221-6601</a> · <a href="mailto:seate.df@trf1.jus.br">seate.df@trf1.jus.br</a>';

  async function registrarAvaliacao(util, id) {
    if (!id) return;
    try { await sb.from("avaliacoes").upsert({ mensagem_id: id, util }, { onConflict: "user_id,mensagem_id" }); } catch {}
  }

  function decorar(wrap, texto, id) {
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
    if (temVoz) botao("Ouvir", I.ouvir, (b) => falar(bolha.innerText, b), "btn-ouvir");
    const copiar = App.copyButton(() => texto).firstChild;   // reaproveita o botão Copiar
    acoes.appendChild(copiar);
    botao("Imprimir", I.imprimir, () => imprimir(wrap));
    botao("WhatsApp", I.whats, () => compartilharWhats(texto));
    wrap.appendChild(acoes);

    if (!publico) return;

    // --- continuações (só aparecem na última resposta, via CSS)
    const seguir = document.createElement("div");
    seguir.className = "msg-seguir";
    seguir.innerHTML = '<span class="msg-seguir-t">Quer continuar? Toque em uma opção:</span>';
    const lista = document.createElement("div");
    lista.className = "msg-seguir-lista";
    SEGUIR.forEach(([rotulo, pergunta]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = rotulo;
      b.onclick = () => enviarTexto(pergunta);
      lista.appendChild(b);
    });
    seguir.appendChild(lista);
    wrap.appendChild(seguir);

    // --- "Isso ajudou?"
    const av = document.createElement("div");
    av.className = "msg-avalia";
    av.innerHTML = '<span>Esta explicação ajudou?</span><button type="button" data-v="1">Sim</button><button type="button" data-v="0">Não</button>';
    av.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const util = b.dataset.v === "1";
        registrarAvaliacao(util, id || wrap.dataset.id);
        av.classList.add("respondida");
        av.innerHTML = util
          ? `<span class="ok">${I.ok}Obrigado! Fico feliz em ajudar.</span>`
          : '<span>Sentimos muito. Toque em <b>Explicar mais simples</b> ou fale com uma pessoa do atendimento, abaixo.</span>';
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

  window.EntendRecursos = { decorar, garantirPrivacidade };
})();
