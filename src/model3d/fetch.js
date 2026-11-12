import { parseObj } from './obj';

// EasyEDA's own model service. It is undocumented, so any failure only means
// that part is drawn as a plain box.
export const MODEL_URL = 'https://modules.easyeda.com/3dmodel/';

const CONCURRENCY = 4;
const TIMEOUT_MS = 30000;
const MAX_MODEL_BYTES = 20 * 1024 * 1024;

// Parsed models are kept for the editor session so launching iBom again is quick.
const cache = new Map();

const fetchText = (url) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  return fetch(url, controller ? { signal: controller.signal } : {})
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const length = parseInt(response.headers.get('content-length'), 10);
      if (length > MAX_MODEL_BYTES) {
        throw new Error('Model is too large');
      }
      return response.text();
    })
    .finally(() => timer && clearTimeout(timer));
};

const fetchModel = (uuid) => {
  if (!cache.has(uuid)) {
    const promise = fetchText(MODEL_URL + encodeURIComponent(uuid)).then((text) => {
      if (text.length > MAX_MODEL_BYTES) {
        throw new Error('Model is too large');
      }
      const model = parseObj(text);
      if (model.positions.length === 0 || model.groups.length === 0) {
        throw new Error('Model has no geometry');
      }
      return { uuid, ...model };
    });
    // Do not remember failures, so a later launch can retry.
    promise.catch(() => cache.delete(uuid));
    cache.set(uuid, promise);
  }
  return cache.get(uuid);
};

export const fetchModels = (uuids, onProgress = () => {}) => {
  const queue = Array.from(new Set(uuids));
  const total = queue.length;
  const models = [];
  const failed = [];
  let done = 0;

  const worker = () => {
    const uuid = queue.shift();
    if (!uuid) {
      return Promise.resolve();
    }
    return fetchModel(uuid)
      .then(model => models.push(model))
      .catch((error) => {
        console.log(`[iBom]: 3D model ${uuid} unavailable: ${error.message}`);
        failed.push(uuid);
      })
      .then(() => {
        done++;
        onProgress(done, total);
        return worker();
      });
  };

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  return Promise.all(workers).then(() => ({ models, failed }));
};
