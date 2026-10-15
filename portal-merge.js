/**
 * Склейка снимков портала (порт логики tasks_server.merge_tasks).
 * window.PortalMerge.mergeTasks(server, client) → merged
 */
(function (global) {
  "use strict";

  function emptyTasks() {
    return {
      version: 8,
      revision: 0,
      objects: [],
      initiators: [],
      questions: [],
      steps: [],
      trash: [],
      notes: [],
      noteTrash: [],
    };
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function byId(items) {
    const out = {};
    asList(items).forEach(function (item) {
      if (item && typeof item === "object" && item.id) out[String(item.id)] = item;
    });
    return out;
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function itemTime(item) {
    if (!item || typeof item !== "object") return "";
    const keys = [
      "_updatedAt",
      "deletedAt",
      "archivedAt",
      "closedAt",
      "createdAt",
      "noteDate",
      "sentAt",
      "deadline",
    ];
    for (let i = 0; i < keys.length; i++) {
      const val = item[keys[i]];
      if (val) return String(val);
    }
    return "";
  }

  function trashEntityId(entry) {
    if (!entry || typeof entry !== "object") return null;
    const snap = entry.snapshot || {};
    const kind = entry.kind;
    let ent = null;
    if (kind === "question") ent = snap.question || {};
    else if (kind === "initiator") ent = snap.initiator || {};
    else if (kind === "object") ent = snap.object || {};
    else return null;
    const eid = ent && ent.id;
    return eid ? String(eid) : null;
  }

  function pickNewer(a, b, aIsClient, bIsClient) {
    const ta = itemTime(a);
    const tb = itemTime(b);
    if (ta > tb) return a;
    if (tb > ta) return b;
    if (aIsClient && !bIsClient) return a;
    if (bIsClient && !aIsClient) return b;
    return a;
  }

  function mergeIdMap(serverItems, clientItems) {
    const sMap = byId(serverItems);
    const cMap = byId(clientItems);
    const out = {};
    Object.keys(sMap).forEach(function (eid) {
      out[eid] = deepCopy(sMap[eid]);
    });
    Object.keys(cMap).forEach(function (eid) {
      if (!out[eid]) out[eid] = deepCopy(cMap[eid]);
      else out[eid] = deepCopy(pickNewer(out[eid], cMap[eid], false, true));
    });
    return out;
  }

  function mergeNotesPair(serverNotes, clientNotes, serverTrash, clientTrash, purgedIds) {
    const purged = {};
    (purgedIds || []).forEach(function (x) {
      purged[String(x)] = true;
    });
    const sN = byId(serverNotes);
    const cN = byId(clientNotes);
    const sT = byId(serverTrash);
    const cT = byId(clientTrash);
    const allIds = {};
    [sN, cN, sT, cT].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        allIds[k] = true;
      });
    });
    const notes = [];
    const noteTrash = [];
    Object.keys(allIds).forEach(function (eid) {
      if (purged[eid] && !cN[eid] && !cT[eid]) return;
      const candidates = [];
      if (cN[eid]) candidates.push([itemTime(cN[eid]), 1, "active", cN[eid]]);
      if (sN[eid]) candidates.push([itemTime(sN[eid]), 0, "active", sN[eid]]);
      if (cT[eid]) candidates.push([itemTime(cT[eid]), 1, "trash", cT[eid]]);
      if (sT[eid]) candidates.push([itemTime(sT[eid]), 0, "trash", sT[eid]]);
      if (!candidates.length) return;
      candidates.sort(function (a, b) {
        if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1;
        return b[1] - a[1];
      });
      const bucket = candidates[0][2];
      const obj = deepCopy(candidates[0][3]);
      if (bucket === "active") {
        delete obj.deletedAt;
        notes.push(obj);
      } else {
        if (!obj.deletedAt) obj.deletedAt = itemTime(obj) || "";
        noteTrash.push(obj);
      }
    });
    return [notes, noteTrash];
  }

  function mergePortalSoft(
    serverActive,
    clientActive,
    serverTrash,
    clientTrash,
    kind,
    purgedTrashIds,
    clearTrash
  ) {
    const sAct = byId(serverActive);
    const cAct = byId(clientActive);

    function trashForKind(items) {
      const byEntity = {};
      const byTrashId = {};
      asList(items).forEach(function (entry) {
        if (!entry || typeof entry !== "object") return;
        if (entry.kind !== kind) return;
        const tid = entry.id;
        if (tid) byTrashId[String(tid)] = entry;
        const eid = trashEntityId(entry);
        if (eid) {
          const prev = byEntity[eid];
          if (!prev || itemTime(entry) >= itemTime(prev)) byEntity[eid] = entry;
        }
      });
      return [byEntity, byTrashId];
    }

    const sDelPair = trashForKind(serverTrash);
    const cDelPair = trashForKind(clientTrash);
    const sDel = sDelPair[0];
    const sTid = sDelPair[1];
    const cDel = cDelPair[0];
    const cTid = cDelPair[1];
    const purged = {};
    (purgedTrashIds || []).forEach(function (x) {
      purged[String(x)] = true;
    });

    const entityIds = {};
    [sAct, cAct, sDel, cDel].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        entityIds[k] = true;
      });
    });

    const active = {};
    const trashOut = {};

    Object.keys(entityIds).forEach(function (eid) {
      const candidates = [];
      if (cAct[eid]) candidates.push([itemTime(cAct[eid]), 1, "active", cAct[eid], null]);
      if (sAct[eid]) candidates.push([itemTime(sAct[eid]), 0, "active", sAct[eid], null]);
      if (cDel[eid]) candidates.push([itemTime(cDel[eid]), 1, "trash", null, cDel[eid]]);
      if (sDel[eid]) candidates.push([itemTime(sDel[eid]), 0, "trash", null, sDel[eid]]);
      if (!candidates.length) return;
      candidates.sort(function (a, b) {
        if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1;
        return b[1] - a[1];
      });
      const top = candidates[0];
      if (top[2] === "active" && top[3]) {
        active[eid] = deepCopy(top[3]);
      } else if (top[2] === "trash" && top[4]) {
        const tid = String(top[4].id || "");
        if (clearTrash || (tid && purged[tid])) return;
        trashOut[tid || "auto_" + eid] = deepCopy(top[4]);
      }
    });

    if (!clearTrash) {
      Object.keys(sTid).forEach(function (tid) {
        if (purged[tid]) return;
        if (trashOut[tid]) return;
        const eid = trashEntityId(sTid[tid]);
        if (eid && active[eid]) return;
        trashOut[tid] = deepCopy(sTid[tid]);
      });
      Object.keys(cTid).forEach(function (tid) {
        if (purged[tid]) return;
        const eid = trashEntityId(cTid[tid]);
        if (eid && active[eid]) return;
        if (!trashOut[tid]) trashOut[tid] = deepCopy(cTid[tid]);
        else trashOut[tid] = deepCopy(pickNewer(trashOut[tid], cTid[tid], false, true));
      });
    }

    return [
      Object.keys(active).map(function (k) {
        return active[k];
      }),
      Object.keys(trashOut).map(function (k) {
        return trashOut[k];
      }),
    ];
  }

  function mergeSteps(serverSteps, clientSteps, mergedQuestions, purgedStepIds) {
    const purged = {};
    (purgedStepIds || []).forEach(function (x) {
      purged[String(x)] = true;
    });
    const merged = mergeIdMap(serverSteps, clientSteps);
    Object.keys(purged).forEach(function (pid) {
      delete merged[pid];
    });
    const activeQ = byId(mergedQuestions);
    const out = [];
    Object.keys(merged).forEach(function (k) {
      const step = merged[k];
      const qid = String(step.questionId || "");
      if (qid && activeQ[qid]) out.push(step);
    });
    return out;
  }

  function mergeOtherTrash(serverTrash, clientTrash, kindHandled, purgedIds, clearTrash) {
    if (clearTrash) return [];
    const purged = {};
    (purgedIds || []).forEach(function (x) {
      purged[String(x)] = true;
    });
    const sMap = {};
    asList(serverTrash).forEach(function (x) {
      if (x && x.id && kindHandled.indexOf(x.kind) < 0) sMap[String(x.id)] = x;
    });
    const cMap = {};
    asList(clientTrash).forEach(function (x) {
      if (x && x.id && kindHandled.indexOf(x.kind) < 0) cMap[String(x.id)] = x;
    });
    const out = mergeIdMap(
      Object.keys(sMap).map(function (k) {
        return sMap[k];
      }),
      Object.keys(cMap).map(function (k) {
        return cMap[k];
      })
    );
    Object.keys(purged).forEach(function (pid) {
      delete out[pid];
    });
    return Object.keys(out).map(function (k) {
      return out[k];
    });
  }

  function mergeTasks(server, client) {
    if (!server || typeof server !== "object") server = emptyTasks();
    if (!client || typeof client !== "object") return deepCopy(server);

    const purgedTrash = client._purgedTrashIds || [];
    const purgedNotes = client._purgedNoteTrashIds || [];
    const purgedSteps = client._purgedStepIds || [];
    const clearTrash = !!client._clearTrash;

    const mo = mergePortalSoft(
      server.objects,
      client.objects,
      server.trash,
      client.trash,
      "object",
      purgedTrash,
      clearTrash
    );
    const mi = mergePortalSoft(
      server.initiators,
      client.initiators,
      server.trash,
      client.trash,
      "initiator",
      purgedTrash,
      clearTrash
    );
    const mq = mergePortalSoft(
      server.questions,
      client.questions,
      server.trash,
      client.trash,
      "question",
      purgedTrash,
      clearTrash
    );
    const otherTrash = mergeOtherTrash(
      server.trash,
      client.trash,
      ["object", "initiator", "question"],
      purgedTrash,
      clearTrash
    );
    const trash = mo[1].concat(mi[1], mq[1], otherTrash);
    const notesPair = mergeNotesPair(
      server.notes,
      client.notes,
      server.noteTrash,
      client.noteTrash,
      purgedNotes
    );
    const steps = mergeSteps(server.steps, client.steps, mq[0], purgedSteps);

    let rev = parseInt(server.revision, 10) || 0;
    rev = rev + 1;

    return {
      version: 8,
      revision: rev,
      objects: mo[0],
      initiators: mi[0],
      questions: mq[0],
      steps: steps,
      trash: trash,
      notes: notesPair[0],
      noteTrash: notesPair[1],
      _dsTemplateBackfillDone: !!(server._dsTemplateBackfillDone || client._dsTemplateBackfillDone),
    };
  }

  global.PortalMerge = {
    emptyTasks: emptyTasks,
    mergeTasks: mergeTasks,
  };
})(typeof window !== "undefined" ? window : globalThis);
