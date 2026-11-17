// Tela "sem internet": tenta de novo ao tocar no botão e recarrega sozinha quando a conexão voltar.
document.getElementById("tentar").addEventListener("click", () => location.reload());
window.addEventListener("online", () => location.reload());
