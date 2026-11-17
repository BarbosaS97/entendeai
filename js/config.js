// Chave "publishable" é feita para ficar no front-end (a segurança vem das políticas RLS).
// NUNCA coloque a chave da Anthropic ou a service_role aqui.
window.ENTENDE_CONFIG = {
  SUPABASE_URL: "https://ujyoqnyruwtlovovijnk.supabase.co",
  SUPABASE_KEY: "sb_publishable_L6rRMUwOv5IKYpbUs5Jk7Q_2o0VxEBK",
  MAX_FILE_MB: 10,
  // Chave PÚBLICA do Cloudflare Turnstile (a secret fica só no painel do Supabase). Vazio = sem verificação.
  TURNSTILE_SITE_KEY: "0x4AAAAAAGFwmfxZplXhGmhu",
};
