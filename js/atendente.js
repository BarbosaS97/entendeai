// Área do atendente: login, sessão e compartilhamento de conversa por código.
// A senha NUNCA é verificada aqui: o navegador só envia nome + senha para a Edge Function
// atendente-login, que compara com a secret SENHA_SEATE no servidor.
(() => {
  const App = window.EntendApp;
  if (!App) return;
  const { sb, state, callFn, esc } = App;
  const $ = (id) => document.getElementById(id);

  const telaLogin = $("login"), telaApp = $("app");
  const formLogin = $("formLogin"), loginErro = $("loginErro"), loginBtn = $("loginBtn");
  const btnComp = $("btnCompartilhar"), dlg = $("dlgCompartilhar"), corpo = $("dlgCompCorpo");
  let timerExpiracao = null;

  // ---------- sessão ----------
  async function sessaoAtiva() {
    const { data } = await sb.rpc("minha_sessao_atendente");
    return Array.isArray(data) && data.length ? data[0] : null;
  }

  function mostrarLogin() {
    telaApp.hidden = true;
    telaLogin.hidden = false;
    $("loginSenha").value = "";
    $("loginNome").focus();
  }

  async function entrarNaArea(sessao) {
    telaLogin.hidden = true;
    telaApp.hidden = false;
    $("sideUserNome").textContent = sessao.nome;
    await App.loadConvs();
    await App.restaurarConversa();
    // Ao expirar a sessão (no servidor), volta para o login
    clearTimeout(timerExpiracao);
    const ms = new Date(sessao.expira_em) - Date.now();
    if (ms > 0 && ms < 2 ** 31) timerExpiracao = setTimeout(() => location.reload(), ms);
  }

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErro.hidden = true;
    loginBtn.disabled = true;
    loginBtn.textContent = "Verificando...";
    try {
      const r = await callFn("atendente-login", {
        acao: "entrar", nome: $("loginNome").value, senha: $("loginSenha").value,
      });
      if (!r.ok) {
        loginErro.textContent = r.data.error || "Não foi possível entrar.";
        loginErro.hidden = false;
        return;
      }
      await entrarNaArea({ nome: r.data.nome, expira_em: r.data.expira_em });
    } catch {
      loginErro.textContent = "Sem conexão. Tente novamente.";
      loginErro.hidden = false;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Entrar";
    }
  });

  $("btnSair").onclick = async () => {
    await callFn("atendente-login", { acao: "sair" });
    location.reload();
  };

  // ---------- compartilhar conversa ----------
  // O botão só aparece com uma conversa aberta
  document.addEventListener("entend:conversa", (e) => { btnComp.hidden = !e.detail.id; });

  const fmtData = (iso) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const AVISO_PRIVACIDADE =
    '<p class="modal-note">Quem tiver este código acessa o conteúdo desta conversa, inclusive os documentos enviados. Entregue o código somente ao atendido, pessoalmente ou por canal seguro.</p>';

  function desenharNaoCompartilhada() {
    corpo.innerHTML = `
      <p class="modal-text">Gere um código de 4 números para o atendido abrir esta conversa no EntendAI.</p>
      <label class="field">
        <span>Validade do código</span>
        <select id="compValidade">
          <option value="24">24 horas</option>
          <option value="72" selected>3 dias</option>
          <option value="168">7 dias</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" id="compContinuar" checked>
        <span>Permitir que o atendido continue a conversa<br><small>Se desmarcado, ele só poderá ler.</small></span>
      </label>
      ${AVISO_PRIVACIDADE}
      <p class="form-error" id="compErro" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="compFechar">Cancelar</button>
        <button type="button" class="btn btn-primary" id="compGerar">Gerar código</button>
      </div>`;
    $("compFechar").onclick = () => dlg.close();
    $("compGerar").onclick = gerar;
  }

  function desenharCompartilhada(s) {
    const digitos = s.codigo.split("").map((d) => `<span>${esc(d)}</span>`).join("");
    corpo.innerHTML = `
      <p class="modal-text">Informe este código ao atendido. Ele deve usar a opção <strong>Acessar conversa com código</strong> no EntendAI.</p>
      <div class="code-display" aria-label="Código ${esc(s.codigo.split("").join(" "))}">${digitos}</div>
      <ul class="meta-list">
        <li>Novos acessos até <strong>${esc(fmtData(s.expira_em))}</strong></li>
        <li>Acessos realizados: <strong>${s.acessos}</strong></li>
        <li>${s.permite_continuar ? "O atendido pode continuar a conversa" : "O atendido só pode ler a conversa"}</li>
      </ul>
      ${AVISO_PRIVACIDADE}
      <p class="form-error" id="compErro" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" id="compRevogar">Revogar</button>
        <button type="button" class="btn btn-secondary" id="compCopiar">Copiar código</button>
        <button type="button" class="btn btn-secondary" id="compMensagem">Mensagem com o código</button>
        <button type="button" class="btn btn-primary" id="compFechar">Fechar</button>
      </div>`;
    $("compFechar").onclick = () => dlg.close();
    $("compCopiar").onclick = async (e) => {
      try { await navigator.clipboard.writeText(s.codigo); e.target.textContent = "Copiado"; setTimeout(() => (e.target.textContent = "Copiar código"), 1500); } catch {}
    };
    $("compRevogar").onclick = revogar;
    $("compMensagem").onclick = () => { dlg.close(); abrirConvidar(); };
  }

  function erroModal(msg) { const el = $("compErro"); if (el) { el.textContent = msg; el.hidden = !msg; } }

  async function abrirModal() {
    corpo.innerHTML = '<p class="modal-text">Carregando...</p>';
    dlg.showModal();
    const r = await callFn("atendente-compartilhar", { acao: "status", conversa_id: state.currentId });
    if (!r.ok) { corpo.innerHTML = `<p class="form-error">${esc(r.data.error || "Erro ao carregar.")}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" id="compFechar">Fechar</button></div>`; $("compFechar").onclick = () => dlg.close(); return; }
    if (r.data.ativo) desenharCompartilhada(r.data); else desenharNaoCompartilhada();
  }

  async function gerar() {
    const btn = $("compGerar");
    btn.disabled = true; btn.textContent = "Gerando...";
    const r = await callFn("atendente-compartilhar", {
      acao: "gerar",
      conversa_id: state.currentId,
      expira_horas: Number($("compValidade").value),
      permite_continuar: $("compContinuar").checked,
    });
    if (!r.ok) { erroModal(r.data.error || "Não foi possível gerar o código."); btn.disabled = false; btn.textContent = "Gerar código"; return; }
    desenharCompartilhada(r.data);
  }

  async function revogar() {
    if (!confirm("Revogar este compartilhamento? O código deixa de funcionar e quem já acessou perde o acesso à conversa.")) return;
    const r = await callFn("atendente-compartilhar", { acao: "revogar", conversa_id: state.currentId });
    if (!r.ok) { erroModal(r.data.error || "Não foi possível revogar."); return; }
    desenharNaoCompartilhada();
  }

  btnComp.onclick = abrirModal;
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // ---------- início ----------
  (async () => {
    try {
      await App.initAuth();
      const sessao = await sessaoAtiva();
      if (sessao) await entrarNaArea(sessao); else mostrarLogin();
    } catch (e) {
      console.error(e);
      mostrarLogin();
    }
  })();

  // ---------- avaliações das respostas ("Esta explicação ajudou?") ----------
  const dlgAval = $("dlgAvaliacoes");
  let avalDados = [], avalFiltro = "todas";
  function desenharAval() {
    const lista = $("avalLista");
    const itens = avalDados.filter((a) => avalFiltro === "todas" || (avalFiltro === "pos" ? a.util : !a.util));
    if (!itens.length) { lista.innerHTML = '<p class="aval-vazio">Nenhuma avaliação neste filtro.</p>'; return; }
    lista.innerHTML = itens.map((a) => {
      const quando = new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<article class="aval-item ${a.util ? "pos" : "neg"}">
        <header><b>${a.util ? "Ajudou" : "Não ajudou"}</b><time>${esc(quando)}</time></header>
        ${a.comentario ? `<p class="aval-coment">&ldquo;${esc(a.comentario)}&rdquo;</p>` : ""}
        <details><summary>Ver início da resposta avaliada</summary><p class="aval-trecho">${esc(a.trecho || "")}${(a.trecho || "").length >= 300 ? "…" : ""}</p></details>
      </article>`;
    }).join("");
  }
  async function abrirAvaliacoes() {
    $("avalTotais").textContent = "Carregando...";
    $("avalLista").innerHTML = "";
    dlgAval.showModal();
    const [t, l] = await Promise.all([sb.rpc("avaliacoes_totais"), sb.rpc("avaliacoes_lista", { p_limite: 150 })]);
    if (t.error || l.error) {
      $("avalTotais").textContent = "Não foi possível carregar. Confira se o SQL 006_avaliacoes_atendente.sql foi executado.";
      return;
    }
    const tot = (t.data && t.data[0]) || { positivas: 0, negativas: 0 };
    const pos = Number(tot.positivas), neg = Number(tot.negativas), soma = pos + neg;
    $("avalTotais").innerHTML = `<div><strong>${pos}</strong><span>ajudou</span></div><div><strong>${neg}</strong><span>não ajudou</span></div><div><strong>${soma ? Math.round((pos / soma) * 100) : 0}%</strong><span>aprovação</span></div>`;
    avalDados = l.data || [];
    avalFiltro = "todas";
    dlgAval.querySelectorAll(".aval-filtro button").forEach((b) => b.classList.toggle("ativo", b.dataset.f === "todas"));
    desenharAval();
  }
  $("btnAvaliacoes").onclick = () => { abrirAvaliacoes(); };
  $("btnAvalFechar").onclick = () => dlgAval.close();
  dlgAval.querySelectorAll(".aval-filtro button").forEach((b) => {
    b.onclick = () => {
      avalFiltro = b.dataset.f;
      dlgAval.querySelectorAll(".aval-filtro button").forEach((x) => x.classList.toggle("ativo", x === b));
      desenharAval();
    };
  });

  // ---------- uso do EntendAI (relatório simples) ----------
  const dlgUso = $("dlgUso");
  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
  async function abrirUso() {
    $("usoCards").textContent = "Carregando...";
    $("usoGrafico").innerHTML = "";
    dlgUso.showModal();
    const [t, d] = await Promise.all([sb.rpc("uso_totais"), sb.rpc("uso_por_dia", { p_dias: 14 })]);
    if (t.error || d.error || !t.data || !t.data[0]) {
      $("usoCards").textContent = "Não foi possível carregar. Confira se o SQL 007_uso_relatorio.sql foi executado.";
      return;
    }
    const u = t.data[0];
    const card = (titulo, p, c, q) => `<div class="uso-card"><h3>${titulo}</h3><dl>
      <div><dt>Pessoas</dt><dd>${fmt(p)}</dd></div><div><dt>Conversas</dt><dd>${fmt(c)}</dd></div><div><dt>Perguntas</dt><dd>${fmt(q)}</dd></div></dl></div>`;
    const desde = u.primeiro_uso ? new Date(u.primeiro_uso).toLocaleDateString("pt-BR") : null;
    $("usoCards").innerHTML =
      card("Hoje", u.pessoas_hoje, u.conversas_hoje, u.perguntas_hoje) +
      card("Últimos 7 dias", u.pessoas_7d, u.conversas_7d, u.perguntas_7d) +
      card("Últimos 30 dias", u.pessoas_30d, u.conversas_30d, u.perguntas_30d) +
      card(desde ? "Total (desde " + desde + ")" : "Total", u.pessoas_total, u.conversas_total, u.perguntas_total);
    const dias = d.data || [];
    const max = Math.max(1, ...dias.map((x) => Number(x.perguntas)));
    $("usoGrafico").innerHTML = dias.map((x) => {
      const [, mm, dd] = String(x.dia).split("-");
      const alt = Math.round((Number(x.perguntas) / max) * 100);
      return `<div class="uso-col" title="${dd}/${mm}: ${fmt(x.perguntas)} perguntas, ${fmt(x.pessoas)} pessoas, ${fmt(x.conversas)} conversas">
        <span class="uso-val">${fmt(x.perguntas)}</span><span class="uso-barra" style="height:${Math.max(alt, Number(x.perguntas) > 0 ? 4 : 1)}%"></span><span class="uso-dia">${dd}/${mm}</span></div>`;
    }).join("");
  }
  $("btnUso").onclick = () => { abrirUso(); };
  $("btnUsoFechar").onclick = () => dlgUso.close();

  // ---------- mensagem padrão para o atendido (link + QR code) ----------
  const dlgConv = $("dlgConvidar");
  const linkSistema = () => new URL("./", location.href).href;     // página do atendido (raiz do site)
  const msgPadrao = (link, cod) =>
    "Olá! Aqui é do atendimento da Justiça Federal no Distrito Federal.\n\n" +
    "Para ajudar você a entender os documentos do seu processo em linguagem simples, use o EntendAI:\n" +
    link + "\n\n" +
    "Você pode abrir o link ou ler o QR code com a câmera do celular. " +
    (cod
      ? "Preparei uma conversa para você. Ao abrir o EntendAI, toque em \"Digitar o código\" e informe estes 4 números:\n\n" +
        "CÓDIGO: " + cod.codigo + "\n(válido até " + fmtData(cod.expira_em) + ")\n\n"
      : "Lá, é só enviar uma foto, um PDF ou o texto do documento que o sistema explica.\n\nSe eu passar um código de 4 números, toque em \"Digitar o código\" para abrir a conversa que preparei para você.\n\n") +
    "O EntendAI é informativo e não substitui a orientação de advogado(a) ou da Defensoria Pública.\n\n" +
    "Dúvidas: (61) 3221-6600 ou (61) 3221-6601 · seate.df@trf1.jus.br";
  let convCod = null;   // código ativo da conversa aberta: { codigo, expira_em }
  let avisoTimer = null;
  function avisoConv(t) {
    const el = $("convAviso");
    el.textContent = t;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.textContent = ""; }, 9000);
  }
  function comLimite(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), ms))]); }
  async function copiarTexto(t) {
    try { await comLimite(navigator.clipboard.writeText(t), 1500); return true; } catch {}
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  }
  // Desenha o QR code (com margem branca) no canvas
  function desenharQr(link) {
    const cv = $("convQr"), ctx = cv.getContext("2d");
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    const n = qr.getModuleCount(), margem = 4, tam = cv.width, passo = tam / (n + margem * 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tam, tam);
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor((c + margem) * passo), Math.floor((r + margem) * passo), Math.ceil(passo), Math.ceil(passo));
    }
  }
  let qrPronto = null;   // imagem do QR já gerada (a cópia precisa começar logo no clique)
  const qrBlob = () => new Promise((res) => $("convQr").toBlob(res, "image/png"));
  function atualizarMsgConv(usarCodigo) {
    $("convMsg").value = msgPadrao(linkSistema(), usarCodigo ? convCod : null);
  }
  function desenharCodConv() {
    const box = $("convCod");
    if (!state.currentId) { box.hidden = true; return; }
    box.hidden = false;
    if (convCod) {
      box.innerHTML = `<label class="check"><input type="checkbox" id="convUsaCod" checked>
        <span>Incluir o código desta conversa: <strong class="conv-cod-n">${esc(convCod.codigo)}</strong>
        <small>(vale até ${esc(fmtData(convCod.expira_em))})</small></span></label>`;
      $("convUsaCod").onchange = (e) => atualizarMsgConv(e.target.checked);
    } else {
      box.innerHTML = `<span class="conv-cod-txt">Esta conversa ainda não tem código para o atendido.</span>
        <button type="button" class="btn btn-secondary btn-sm" id="convGerarCod">Gerar código desta conversa</button>`;
      $("convGerarCod").onclick = () => { dlgConv.close(); abrirModal(); };
    }
  }
  async function abrirConvidar() {
    const link = linkSistema();
    convCod = null;
    $("convLink").textContent = link;
    $("convAviso").textContent = "";
    $("convCod").hidden = true;
    try { desenharQr(link); qrPronto = null; qrBlob().then((b) => { qrPronto = b; }); } catch (e) { console.error(e); }
    atualizarMsgConv(false);
    dlgConv.showModal();
    if (state.currentId) {
      const r = await callFn("atendente-compartilhar", { acao: "status", conversa_id: state.currentId });
      if (r.ok && r.data.ativo && r.data.codigo) convCod = { codigo: r.data.codigo, expira_em: r.data.expira_em };
      desenharCodConv();
      if (convCod) atualizarMsgConv(true);
    }
  }
  $("btnConvidar").onclick = abrirConvidar;
  $("btnConvFechar").onclick = () => dlgConv.close();
  $("btnCopiarMsg").onclick = async () => avisoConv((await copiarTexto($("convMsg").value)) ? "Mensagem copiada. Agora é só colar no e-mail ou no WhatsApp." : "Não foi possível copiar. Selecione o texto e copie manualmente.");
  // Combo completo: texto + imagem do QR code. Tenta do mais completo ao mais simples e diz o que foi copiado.
  function feedbackBotao(btn, ok) {
    const orig = btn.dataset.rotulo || btn.textContent;
    btn.dataset.rotulo = orig;
    btn.textContent = ok ? "Copiado!" : "Não copiou";
    setTimeout(() => { btn.textContent = orig; }, 2200);
  }
  $("btnCopiarTudo").onclick = async (ev) => {
    const btn = ev.currentTarget;
    const texto = $("convMsg").value;
    const escHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const corpoHtml = escHtml(texto).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
    const dataUrl = $("convQr").toDataURL("image/png");
    const html = `<div>${corpoHtml}<br><br><img src="${dataUrl}" width="240" height="240" alt="QR code do EntendAI"></div>`;
    const tx = new Blob([texto], { type: "text/plain" });
    const ht = new Blob([html], { type: "text/html" });
    const tentativas = [
      async () => { const img = qrPronto || (await qrBlob()); await comLimite(navigator.clipboard.write([new ClipboardItem({ "image/png": img, "text/plain": tx, "text/html": ht })]), 1500); return "Mensagem e QR code copiados. Cole no e-mail ou no WhatsApp."; },
      async () => { await comLimite(navigator.clipboard.write([new ClipboardItem({ "text/plain": tx, "text/html": ht })]), 1500); return "Mensagem e QR code copiados (para e-mail). No WhatsApp, cole a mensagem e use também \"Copiar QR code\"."; },
      async () => { if (!(await copiarTexto(texto))) throw new Error("sem cópia"); return "Só a mensagem foi copiada (o navegador não copia imagem). Use \"Copiar QR code\" para a imagem."; },
    ];
    let ultimoErro = "";
    for (const t of tentativas) {
      try { const msg = await t(); avisoConv(msg); feedbackBotao(btn, true); return; }
      catch (e) { ultimoErro = (e && e.name) || "erro"; console.warn("cópia combinada:", e); }
    }
    avisoConv("Não foi possível copiar (" + ultimoErro + "). Use \"Baixar imagem\" e copie o texto manualmente.");
    feedbackBotao(btn, false);
  };
  $("btnCopiarLink").onclick = async () => avisoConv((await copiarTexto(linkSistema())) ? "Link copiado." : "Não foi possível copiar o link.");
  $("btnCopiarQr").onclick = async () => {
    try {
      const blob = await qrBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      avisoConv("QR code copiado. Cole na conversa ou no e-mail.");
    } catch {
      avisoConv("Seu navegador não permite copiar a imagem. Use \"Baixar imagem\" e anexe o arquivo.");
    }
  };
  $("btnBaixarQr").onclick = async () => {
    const blob = await qrBlob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "qrcode-entendai.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("btnConvWhats").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent($("convMsg").value), "_blank", "noopener");
  $("btnConvEmail").onclick = () => {
    location.href = "mailto:?subject=" + encodeURIComponent("Acesso ao EntendAI - Justiça Federal no DF") + "&body=" + encodeURIComponent($("convMsg").value);
  };
})();
