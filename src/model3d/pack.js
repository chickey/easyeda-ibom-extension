// Compact binary container for 3D models embedded in the generated HTML.
//
//   "IB3D" | u32 version | u32 header length | header JSON | data...
//
// Each model stores Uint16 positions quantised to its bounding box followed by
// one index array per colour group (Uint16, or Uint32 for large models).
// Every block starts on a 4 byte boundary so it can be viewed in place.

const MAGIC = 'IB3D';
const VERSION = 1;

const align4 = value => (value + 3) & ~3;

const boundsOf = (positions) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
};

export const packModels = (models) => {
  const entries = models.map((model) => {
    const vertexCount = model.positions.length / 3;
    const { min, max } = boundsOf(model.positions);
    return {
      model,
      header: {
        uuid: model.uuid,
        min,
        max,
        vertexCount,
        indexBytes: vertexCount > 65535 ? 4 : 2,
        groups: model.groups.map(group => ({
          colour: group.colour.map(c => Math.round(c * 1000) / 1000),
          count: group.indices.length
        }))
      }
    };
  });

  const headerBytes = new TextEncoder().encode(JSON.stringify({ models: entries.map(e => e.header) }));
  let size = align4(12 + headerBytes.length);
  entries.forEach(({ header }) => {
    size += align4(header.vertexCount * 3 * 2);
    header.groups.forEach((group) => {
      size += align4(group.count * header.indexBytes);
    });
  });

  const buffer = new ArrayBuffer(size);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let i = 0; i < 4; i++) {
    bytes[i] = MAGIC.charCodeAt(i);
  }
  view.setUint32(4, VERSION, true);
  view.setUint32(8, headerBytes.length, true);
  bytes.set(headerBytes, 12);

  let offset = align4(12 + headerBytes.length);
  entries.forEach(({ model, header }) => {
    const quantised = new Uint16Array(buffer, offset, header.vertexCount * 3);
    for (let i = 0; i < model.positions.length; i++) {
      const axis = i % 3;
      const extent = header.max[axis] - header.min[axis];
      quantised[i] = extent > 0 ? Math.round((model.positions[i] - header.min[axis]) / extent * 65535) : 0;
    }
    offset += align4(quantised.byteLength);

    model.groups.forEach((group) => {
      const IndexArray = header.indexBytes === 4 ? Uint32Array : Uint16Array;
      const indices = new IndexArray(buffer, offset, group.indices.length);
      indices.set(group.indices);
      offset += align4(indices.byteLength);
    });
  });

  return bytes;
};

export const unpackModels = (bytes) => {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== MAGIC || view.getUint32(4, true) !== VERSION) {
    throw new Error('Unsupported 3D model data');
  }

  const headerLength = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, headerLength)));
  let offset = align4(12 + headerLength);

  return header.models.map((entry) => {
    const quantised = new Uint16Array(buffer, offset, entry.vertexCount * 3);
    offset += align4(quantised.byteLength);

    const positions = new Float32Array(quantised.length);
    for (let i = 0; i < quantised.length; i++) {
      const axis = i % 3;
      positions[i] = entry.min[axis] + quantised[i] / 65535 * (entry.max[axis] - entry.min[axis]);
    }

    const groups = entry.groups.map((group) => {
      const IndexArray = entry.indexBytes === 4 ? Uint32Array : Uint16Array;
      const indices = new IndexArray(buffer, offset, group.count);
      offset += align4(indices.byteLength);
      return { colour: group.colour, indices };
    });

    return { uuid: entry.uuid, min: entry.min, max: entry.max, positions, groups };
  });
};

// gzip via the browser's CompressionStream when it exists; otherwise stored as is.
const pipeThrough = (bytes, stream) => {
  return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(b => new Uint8Array(b));
};

const toBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const fromBase64 = (text) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const encodeModels = (models) => {
  const bytes = packModels(models);
  if (typeof CompressionStream === 'undefined') {
    return Promise.resolve({ encoding: 'raw', data: toBase64(bytes) });
  }
  return pipeThrough(bytes, new CompressionStream('gzip')).then(compressed => ({
    encoding: 'gzip',
    data: toBase64(compressed)
  }));
};

export const decodeModels = (encoded) => {
  const bytes = fromBase64(encoded.data);
  if (encoded.encoding === 'gzip') {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('This browser cannot decompress the 3D models'));
    }
    return pipeThrough(bytes, new DecompressionStream('gzip')).then(unpackModels);
  }
  return Promise.resolve(unpackModels(bytes));
};
