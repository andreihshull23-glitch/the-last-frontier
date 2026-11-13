// Campaign persistence.
// Signed-in viewers get a private cloud save in the artifact's per-viewer db
// subtree (data/users/<id>/campaign); every viewer also gets a localStorage
// mirror. Loading picks whichever copy was written most recently.
// Mid-ride snapshots stay in localStorage: they change every few seconds and
// only matter on the device that is playing.

import { toSavePayload, fromSavePayload } from './rules.js';

const LOCAL_SAVE = 'lf.save.v1';
const LOCAL_RUN = 'lf.run.v2';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createSaveManager() {
  let db = null;
  let uid = null;
  let connecting = null;
  let writing = false;
  let pending = null;
  let cloudBlocked = false;
  let baseline = 0;
  const status = { cloud: false, local: false, conflict: false };

  function connect() {
    if (connecting) return connecting;
    connecting = (async () => {
      if (!window.claude?.use) return false;
      try {
        const [dbNs, userNs] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!dbNs || !userNs) return false;
        const id = await userNs.id();
        if (!id) return false;
        db = dbNs;
        uid = id;
        return true;
      } catch {
        return false;
      }
    })();
    return connecting;
  }

  const ref = () => db.doc(`data/users/${uid}/campaign`);

  async function readCloud() {
    if (!db) return null;
    try {
      const snap = await ref().get();
      return snap.exists ? JSON.parse(JSON.stringify(snap.data())) : null;
    } catch {
      return null;
    }
  }

  async function load() {
    const local = readJSON(LOCAL_SAVE);
    const timedOut = Symbol('timeout');
    const ok = await Promise.race([connect(), sleep(3500).then(() => timedOut)]);
    let cloud = null;
    if (ok === true) {
      cloud = await readCloud();
      status.cloud = !cloudBlocked;
    } else if (ok === timedOut) {
      // The viewer answered late. Only write to the cloud if it holds nothing newer.
      connect().then(async (late) => {
        if (!late) return;
        const remote = await readCloud();
        if (remote && (remote.savedAt ?? 0) > baseline) {
          cloudBlocked = true;
          status.conflict = true;
        } else {
          status.cloud = true;
        }
      });
    }
    const options = [cloud, local]
      .map((p) => (p ? fromSavePayload(p) : null))
      .filter((r) => r?.ok)
      .sort((a, b) => b.savedAt - a.savedAt);
    if (!options.length) return null;
    baseline = options[0].savedAt;
    return options[0];
  }

  async function flush() {
    writing = true;
    while (pending && db && !cloudBlocked) {
      const payload = pending;
      pending = null;
      try {
        await ref().set(payload);
      } catch (e) {
        const code = e?.code;
        if (code === 'unavailable') {
          await sleep(600 + Math.random() * 900);
          if (!pending) pending = payload;
        } else if (code === 'resource_exhausted') {
          await sleep(2500);
          if (!pending) pending = payload;
        } else {
          // Not allowed to write here (view-only access, revoked grant, bad path): stay local.
          cloudBlocked = true;
          status.cloud = false;
        }
      }
    }
    writing = false;
  }

  return {
    status,
    load,
    save(campaign) {
      const payload = JSON.parse(JSON.stringify(toSavePayload(campaign)));
      baseline = payload.savedAt;
      status.local = writeJSON(LOCAL_SAVE, payload);
      if (db && !cloudBlocked && status.cloud) {
        pending = payload;
        if (!writing) flush();
      }
    },
    saveRun(expeditionId, json) {
      return writeJSON(LOCAL_RUN, { expeditionId, savedAt: Date.now(), state: json });
    },
    loadRun(expeditionId) {
      const run = readJSON(LOCAL_RUN);
      return run && run.expeditionId === expeditionId && typeof run.state === 'string' ? run.state : null;
    },
    clearRun() {
      try {
        localStorage.removeItem(LOCAL_RUN);
      } catch {
        // nothing to clear
      }
    },
  };
}
