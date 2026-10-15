/**
 * Скопируйте этот файл как portal-config.js и заполните значения из Supabase:
 * Project Settings → API → Project URL и anon public key.
 *
 * НЕ коммитьте portal-config.js с боевыми ключами в публичный репозиторий.
 */
window.PORTAL_CLOUD = {
  enabled: true,
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  stateId: "default",
};
