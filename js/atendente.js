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
        <button type="button" class="btn btn-primary" id="compFechar">Fechar</button>
      </div>`;
    $("compFechar").onclick = () => dlg.close();
    $("compCopiar").onclick = async (e) => {
      try { await navigator.clipboard.writeText(s.codigo); e.target.textContent = "Copiado"; setTimeout(() => (e.target.textContent = "Copiar código"), 1500); } catch {}
    };
    $("compRevogar").onclick = revogar;
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
})();
