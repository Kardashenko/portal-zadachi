/**
 * Хранение портала в Supabase (таблица portal_state).
 * Требует: portal-config.js (PORTAL_CLOUD) и portal-merge.js (PortalMerge).
 */
(function (global) {
  "use strict";

  function cfg() {
    return global.PORTAL_CLOUD || null;
  }

  function isConfigured() {
    const c = cfg();
    return !!(
      c &&
      c.enabled &&
      c.supabaseUrl &&
      c.supabaseAnonKey &&
      String(c.supabaseUrl).indexOf("YOUR_PROJECT") < 0 &&
      String(c.supabaseAnonKey).indexOf("YOUR_ANON") < 0
    );
  }

  function stateId() {
    const c = cfg();
    return (c && c.stateId) || "default";
  }

  function baseHeaders() {
    const c = cfg();
    return {
      apikey: c.supabaseAnonKey,
      Authorization: "Bearer " + c.supabaseAnonKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  function restUrl(pathQuery) {
    const c = cfg();
    return String(c.supabaseUrl).replace(/\/$/, "") + "/rest/v1/" + pathQuery;
  }

  async function fetchRow() {
    const url =
      restUrl("portal_state") +
      "?id=eq." +
      encodeURIComponent(stateId()) +
      "&select=payload,revision";
    const res = await fetch(url, {
      method: "GET",
      headers: baseHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Supabase GET " + res.status);
    const rows = await res.json();
    if (!rows || !rows.length) {
      const empty = global.PortalMerge ? global.PortalMerge.emptyTasks() : { version: 8, revision: 0 };
      return { payload: empty, revision: 0 };
    }
    return {
      payload: rows[0].payload || {},
      revision: parseInt(rows[0].revision, 10) || 0,
    };
  }

  async function load() {
    const row = await fetchRow();
    const payload = row.payload || {};
    if (typeof payload.revision === "undefined") payload.revision = row.revision;
    return payload;
  }

  async function peekRevision() {
    const row = await fetchRow();
    return parseInt(row.revision, 10) || 0;
  }

  async function save(clientPayload) {
    if (!global.PortalMerge || !global.PortalMerge.mergeTasks) {
      throw new Error("PortalMerge не загружен");
    }
    const maxAttempts = 5;
    let lastErr = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const row = await fetchRow();
        const server = row.payload || {};
        const expectedRev = parseInt(row.revision, 10) || 0;
        const merged = global.PortalMerge.mergeTasks(server, clientPayload);
        const nextRev = parseInt(merged.revision, 10) || expectedRev + 1;

        const url =
          restUrl("portal_state") +
          "?id=eq." +
          encodeURIComponent(stateId()) +
          "&revision=eq." +
          expectedRev;
        const res = await fetch(url, {
          method: "PATCH",
          headers: baseHeaders(),
          body: JSON.stringify({
            payload: merged,
            revision: nextRev,
          }),
        });
        if (!res.ok) throw new Error("Supabase PATCH " + res.status);
        const updated = await res.json();
        if (!updated || !updated.length) {
          // конфликт ревизии — повторить
          lastErr = new Error("revision conflict");
          continue;
        }
        return updated[0].payload || merged;
      } catch (e) {
        lastErr = e;
        await new Promise(function (r) {
          setTimeout(r, 120 + attempt * 80);
        });
      }
    }
    throw lastErr || new Error("cloud save failed");
  }

  global.PortalCloud = {
    isConfigured: isConfigured,
    load: load,
    save: save,
    peekRevision: peekRevision,
  };
})(typeof window !== "undefined" ? window : globalThis);
