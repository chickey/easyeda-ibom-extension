// Parser for EasyEDA's OBJ 3D models (https://modules.easyeda.com/3dmodel/{uuid}).
// They are in millimetres and keep their materials inline:
//   newmtl 1 / Kd r g b / endmtl, then v x y z, usemtl 1, f a b c ...
// Only vertex positions, faces and diffuse colours are used.

const DEFAULT_COLOUR = [0.6, 0.6, 0.6];

const toIndex = (token, vertexCount) => {
  // Faces may be "a", "a/b", "a//c" or "a/b/c"; negative indices are relative.
  const value = parseInt(token, 10);
  return value < 0 ? vertexCount + value : value - 1;
};

export const parseObj = (text) => {
  const positions = [];
  const colours = {};
  const groups = [];
  const groupsByMaterial = {};

  let currentMaterial = null;
  let currentGroup = null;

  const useMaterial = (name) => {
    currentMaterial = name;
    if (!groupsByMaterial[name]) {
      groupsByMaterial[name] = { material: name, indices: [] };
      groups.push(groupsByMaterial[name]);
    }
    currentGroup = groupsByMaterial[name];
  };

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line[0] === '#') {
      continue;
    }

    const parts = line.split(/\s+/);
    switch (parts[0]) {
      case 'v':
        positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        break;

      case 'newmtl':
        currentMaterial = parts.slice(1).join(' ');
        break;

      case 'Kd':
        if (currentMaterial !== null) {
          colours[currentMaterial] = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
        }
        break;

      case 'usemtl':
        useMaterial(parts.slice(1).join(' '));
        break;

      case 'f': {
        if (!currentGroup) {
          useMaterial('__default');
        }
        const vertexCount = positions.length / 3;
        const face = [];
        for (let j = 1; j < parts.length; j++) {
          face.push(toIndex(parts[j].split('/')[0], vertexCount));
        }
        if (face.some(index => !(index >= 0 && index < vertexCount))) {
          break;
        }
        // Triangulate polygons as a fan.
        for (let j = 1; j + 1 < face.length; j++) {
          currentGroup.indices.push(face[0], face[j], face[j + 1]);
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    positions: new Float32Array(positions),
    groups: groups
      .filter(group => group.indices.length > 0)
      .map(group => ({
        colour: (colours[group.material] || DEFAULT_COLOUR).map(c => Math.min(1, Math.max(0, c || 0))),
        indices: group.indices
      }))
  };
};
