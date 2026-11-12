// Fallback for footprints placed without a 3D model: fetch the current library
// footprint for the part's LCSC number and place its model the way EasyEDA
// would if the footprint were updated from the library.
//
// The products API has no CORS headers, so inside the editor it is called on
// the editor's own origin (easyeda.com or lceda.cn).

const API_PATH = '/api/products/';
const API_VERSION = '6.4.19.5';
const CONCURRENCY = 4;

const apiOrigin = () => {
  if (typeof location !== 'undefined' && /(^|\.)(easyeda\.com|lceda\.cn)$/.test(location.hostname)) {
    return location.origin;
  }
  return 'https://easyeda.com';
};

const cache = new Map();

const numbers = (value, count) => {
  const parts = String(value || '').split(',').map(parseFloat);
  return Array.from({ length: count }, (_, index) => (isFinite(parts[index]) ? parts[index] : 0));
};

// Returns { package, uuid, offset: [dx, dy], z, rotation: [rx, ry, rz] } in the
// library footprint's own frame, or null when the part has no 3D model.
const fetchLibraryModel = (lcsc) => {
  if (!cache.has(lcsc)) {
    const url = `${apiOrigin()}${API_PATH}${encodeURIComponent(lcsc)}/components?version=${API_VERSION}`;
    const promise = fetch(url)
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((json) => {
        const detail = (json && json.result && json.result.packageDetail) || {};
        const data = typeof detail.dataStr === 'string' ? JSON.parse(detail.dataStr) : (detail.dataStr || {});
        const head = data.head || {};
        const record = (data.shape || []).find(shape => /^SVGNODE~/.test(shape));
        if (!record) {
          return null;
        }
        const attrs = JSON.parse(record.slice(record.indexOf('~') + 1)).attrs || {};
        if (!attrs.uuid) {
          return null;
        }
        const origin = numbers(attrs.c_origin, 2);
        return {
          package: detail.title || '',
          uuid: attrs.uuid,
          offset: [origin[0] - parseFloat(head.x || 0), origin[1] - parseFloat(head.y || 0)],
          z: parseFloat(attrs.z) || 0,
          rotation: numbers(attrs.c_rotation, 3)
        };
      });
    promise.catch(() => cache.delete(lcsc));
    cache.set(lcsc, promise);
  }
  return cache.get(lcsc);
};

// Turns a library model into a board placement for the footprint. A footprint
// rotated by θ turns the model offset by -θ in Y-down canvas space and adds θ
// to the model's Z rotation (checked against footprints that do store their model).
const placeFromLibrary = (lookup, model) => {
  const theta = lookup.rotation * Math.PI / 180;
  const [dx, dy] = model.offset;
  return {
    uuid: model.uuid,
    title: model.package,
    origin: [
      lookup.origin[0] + dx * Math.cos(theta) + dy * Math.sin(theta),
      lookup.origin[1] - dx * Math.sin(theta) + dy * Math.cos(theta)
    ],
    z: model.z,
    rotation: [model.rotation[0], model.rotation[1], model.rotation[2] + lookup.rotation],
    fromLibrary: true
  };
};

// iBom's footprint box: rotate into the footprint frame, then test against relpos/size.
const insideFootprint = (point, footprint) => {
  const margin = 2; // canvas units (0.5 mm)
  const { pos, angle, relpos, size } = footprint.bbox;
  const a = angle * Math.PI / 180;
  const vx = point[0] - pos[0];
  const vy = point[1] - pos[1];
  const x = vx * Math.cos(a) - vy * Math.sin(a);
  const y = vx * Math.sin(a) + vy * Math.cos(a);
  return x >= relpos[0] - margin && x <= relpos[0] + size[0] + margin &&
         y >= relpos[1] - margin && y <= relpos[1] + size[1] + margin;
};

// Replaces lookup entries in placements with library placements where possible.
// Only top-side parts whose library package name matches are placed: bottom-side
// mirroring of library data has not been checked, and a different package could
// put the model in the wrong place. The library footprint may also have changed
// since the board was made, so a model whose origin lands outside the placed
// footprint is rejected. Unresolved entries stay as plain boxes.
export const resolveLibraryModels = (placements, footprints) => {
  const pending = [];
  placements.forEach((placement, index) => {
    if (placement && placement.lookup) {
      pending.push(index);
    }
  });

  const queue = pending.slice();
  const worker = () => {
    const index = queue.shift();
    if (index === undefined) {
      return Promise.resolve();
    }
    const { lookup } = placements[index];
    const resolve = lookup.layer === '1'
      ? fetchLibraryModel(lookup.lcsc).then((model) => {
        if (model && model.package === lookup.package) {
          const placement = placeFromLibrary(lookup, model);
          if (insideFootprint(placement.origin, footprints[index])) {
            placements[index] = placement;
          }
        }
      })
      : Promise.resolve();
    return resolve
      .catch((error) => {
        console.log(`[iBom]: 3D model lookup for ${lookup.lcsc} failed: ${error.message}`);
      })
      .then(() => {
        if (placements[index] && placements[index].lookup) {
          placements[index] = null;
        }
        return worker();
      });
  };

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  return Promise.all(workers).then(() => placements);
};
