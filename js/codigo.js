// Chat público: "Acessar conversa com código".
// O atendido digita o código de 4 dígitos; a Edge Function conversa-codigo valida (com rate limit)
// e vincula a conversa à sessão anônima dele. Depois, a conversa aparece no histórico.
(() => {
  const App = window.EntendApp;
  if (!App) return;
  const $ = (id) => document.getElementById(id);
  const dlg = $("dlgCodigo"), form = $("formCodigo"), input = $("inputCodigo");
  const erro = $("erroCodigo"), ok = $("btnCodigoOk");

  function mostrarErro(msg) { erro.textContent = msg; erro.hidden = !msg; }

  $("btnCodigo").onclick = () => {
    input.value = ""; ok.disabled = true; mostrarErro("");
    dlg.showModal();
    input.focus();
  };
  $("btnCodigoCancelar").onclick = () => dlg.close();
  // Clique fora da caixa fecha
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  // Só números, no máximo 4
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    ok.disabled = input.value.length !== 4;
    mostrarErro("");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (input.value.length !== 4) return;
    ok.disabled = true;
    ok.textContent = "Verificando...";
    try {
      const r = await App.callFn("conversa-codigo", { acao: "resgatar", codigo: input.value });
      if (!r.ok) {
        mostrarErro(r.data.error || "Não foi possível acessar a conversa.");
        return;
      }
      dlg.close();
      await App.loadConvs();
      await App.openConv(r.data.conversa_id);
    } catch {
      mostrarErro("Sem conexão. Tente novamente.");
    } finally {
      ok.textContent = "Acessar";
      ok.disabled = input.value.length !== 4;
    }
  });
})();
