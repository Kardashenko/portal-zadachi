/**
 * Локально: enabled=false — работает как раньше (tasks_server / tasks.json).
 * Для облака: скопируйте значения из portal-config.example.js и поставьте enabled: true.
 */
window.PORTAL_CLOUD = {
  enabled: false,
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  stateId: "default",
};
