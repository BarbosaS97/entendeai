// Worker da voz local (Piper, roda no próprio aparelho, de graça e sem enviar texto a nenhum serviço).
// Fica num processo separado para a síntese não travar a tela enquanto a explicação é lida.
//
// Mensagens recebidas: { id, tipo: "estado" | "baixar" | "preparar" | "falar", texto? }
// Respostas: { id, ok, ... } e, durante o download, { id, progresso: 0..1 }
import * as tts from "./piper-tts-web.js";

const VOZ_ID = "pt_BR-faber-medium";   // voz em português do Brasil (cerca de 63 MB, baixada uma única vez)
// Velocidade da fala: 1 = padrão do modelo; valores maiores falam mais devagar. 1,35 (cerca de 150 palavras por minuto) é confortável para explicações.
self.PIPER_FATOR_DURACAO = 1.35;
let fila = Promise.resolve();            // uma tarefa por vez: o motor de síntese não aceita duas ao mesmo tempo

async function tratar({ id, tipo, texto }) {
  try {
    if (tipo === "estado") {
      const guardadas = await tts.stored();
      self.postMessage({ id, ok: true, instalada: guardadas.includes(VOZ_ID) });
    } else if (tipo === "baixar") {
      await tts.download(VOZ_ID, (p) => {
        if (p.total) self.postMessage({ id, progresso: p.loaded / p.total });
      });
      self.postMessage({ id, ok: true });
    } else if (tipo === "preparar") {
      await tts.TtsSession.create({ voiceId: VOZ_ID });   // carrega o modelo na memória (a primeira vez leva alguns segundos)
      self.postMessage({ id, ok: true });
    } else if (tipo === "falar") {
      const wav = await tts.predict({ text: texto, voiceId: VOZ_ID });
      const buf = await wav.arrayBuffer();
      self.postMessage({ id, ok: true, wav: buf }, [buf]);
    } else {
      self.postMessage({ id, ok: false, erro: "tipo desconhecido" });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, erro: String((e && e.message) || e) });
  }
}

self.onmessage = (e) => { fila = fila.then(() => tratar(e.data)); };
