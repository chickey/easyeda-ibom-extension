// Interactive 3D board view embedded in the generated iBom page.
//
// Built as a separate bundle (viewer3d.js) and exposed as window.IBom3D.
// The scene is in millimetres with Z up; EasyEDA canvas units are 10 mil and
// Y down, so a canvas point (x, y) maps to ((x - cx) * 0.254, -(y - cy) * 0.254).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { decodeModels } from '../model3d/pack';
import { buildBoardOutline } from './outline';
import { MM_PER_UNIT, BOARD_THICKNESS, normaliseMatrix, placementMatrix } from './placement';

const PLACEHOLDER_HEIGHT = 0.6;
const DEG = Math.PI / 180;

const COLOURS = {
  light: { background: 0xf2f2f2 },
  dark: { background: 0x252c30 },
  boardEdge: 0xc2b98e,
  placeholder: 0x9aa4ad,
  highlight: 0xd04040
};

const isSupported = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch (e) {
    return false;
  }
};

const buildModelGeometry = (model) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));

  const indexCount = model.groups.reduce((sum, group) => sum + group.indices.length, 0);
  const IndexArray = model.positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(indexCount);
  let start = 0;
  model.groups.forEach((group, materialIndex) => {
    indices.set(group.indices, start);
    geometry.addGroup(start, group.indices.length, materialIndex);
    start += group.indices.length;
  });
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.applyMatrix4(normaliseMatrix(model));
  geometry.computeBoundingSphere();
  return geometry;
};

const createViewer = (options) => {
  const { container, pcbdata } = options;
  const bbox = pcbdata.edges_bbox;
  const cx = (bbox.minx + bbox.maxx) / 2;
  const cy = (bbox.miny + bbox.maxy) / 2;
  const toScene = (x, y) => [(parseFloat(x) - cx) * MM_PER_UNIT, -(parseFloat(y) - cy) * MM_PER_UNIT];
  const toCanvas = (x, y) => [x / MM_PER_UNIT + cx, -y / MM_PER_UNIT + cy];

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(1, -1.5, 3);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
  fillLight.position.set(-1.5, 1, -2.5);
  scene.add(fillLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;

  let needsRender = true;
  const requestRender = () => {
    needsRender = true;
  };
  controls.addEventListener('change', requestRender);

  // Until the user moves the camera, keep the board fitted when the panel resizes.
  let currentView = 'iso';
  let userMovedCamera = false;
  controls.addEventListener('start', () => {
    userMovedCamera = true;
  });

  // Board
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const textures = {};
  const boardMaterials = {
    F: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 }),
    B: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 }),
    edge: new THREE.MeshStandardMaterial({ color: COLOURS.boardEdge, roughness: 0.8 }),
    hidden: new THREE.MeshBasicMaterial({ visible: false })
  };

  const outline = buildBoardOutline(pcbdata.edges) || {
    outer: [[bbox.minx, bbox.miny], [bbox.maxx, bbox.miny], [bbox.maxx, bbox.maxy], [bbox.minx, bbox.maxy]],
    holes: []
  };
  const toVectors = points => points.map(p => new THREE.Vector2(...toScene(p[0], p[1])));
  const shape = new THREE.Shape(toVectors(outline.outer));
  outline.holes.forEach(hole => shape.holes.push(new THREE.Path(toVectors(hole))));

  // UVs map the board texture, which covers edges_bbox in canvas coordinates.
  const applyBoardUVs = (geometry) => {
    const position = geometry.getAttribute('position');
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      const [x, y] = toCanvas(position.getX(i), position.getY(i));
      uv[i * 2] = (x - bbox.minx) / (bbox.maxx - bbox.minx);
      uv[i * 2 + 1] = 1 - (y - bbox.miny) / (bbox.maxy - bbox.miny);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };

  const topGeometry = new THREE.ShapeGeometry(shape);
  applyBoardUVs(topGeometry);
  topGeometry.translate(0, 0, BOARD_THICKNESS);

  // The bottom face points down: reverse the winding and the normals.
  const bottomGeometry = new THREE.ShapeGeometry(shape);
  applyBoardUVs(bottomGeometry);
  const bottomIndex = bottomGeometry.index.array;
  for (let i = 0; i < bottomIndex.length; i += 3) {
    const swap = bottomIndex[i + 1];
    bottomIndex[i + 1] = bottomIndex[i + 2];
    bottomIndex[i + 2] = swap;
  }
  const bottomNormals = bottomGeometry.getAttribute('normal');
  for (let i = 0; i < bottomNormals.count; i++) {
    bottomNormals.setXYZ(i, 0, 0, -1);
  }

  // Extrusion groups: 0 = both caps (hidden, drawn above), 1 = side walls.
  const sideGeometry = new THREE.ExtrudeGeometry(shape, { depth: BOARD_THICKNESS, bevelEnabled: false, curveSegments: 1 });
  boardGroup.add(new THREE.Mesh(topGeometry, boardMaterials.F));
  boardGroup.add(new THREE.Mesh(bottomGeometry, boardMaterials.B));
  boardGroup.add(new THREE.Mesh(sideGeometry, [boardMaterials.hidden, boardMaterials.edge]));

  const refreshTextures = () => {
    if (!options.renderTexture) {
      return;
    }
    const maxSize = Math.min(renderer.capabilities.maxTextureSize, renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
    ['F', 'B'].forEach((layer) => {
      const canvas = options.renderTexture(layer, maxSize);
      if (!canvas) {
        return;
      }
      if (textures[layer]) {
        textures[layer].dispose();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textures[layer] = texture;
      boardMaterials[layer].map = texture;
      boardMaterials[layer].needsUpdate = true;
    });
    requestRender();
  };

  // Parts
  const partsGroup = new THREE.Group();
  scene.add(partsGroup);
  const partsByFootprint = {};
  const materialCache = {};

  const partMaterial = (colour) => {
    const key = colour.join(',');
    if (!materialCache[key]) {
      materialCache[key] = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(colour[0], colour[1], colour[2], THREE.SRGBColorSpace),
        roughness: 0.6,
        metalness: 0.1
      });
    }
    return materialCache[key];
  };

  const addPart = (footprintIndex, object) => {
    object.userData.footprintIndex = footprintIndex;
    object.traverse((child) => {
      if (child.isMesh) {
        child.userData.footprintIndex = footprintIndex;
        child.userData.baseMaterial = child.material;
      }
    });
    partsGroup.add(object);
    partsByFootprint[footprintIndex] = object;
  };

  const placeholderMaterial = new THREE.MeshStandardMaterial({ color: COLOURS.placeholder, roughness: 0.7 });
  const addPlaceholder = (footprintIndex, footprint) => {
    const { pos, relpos, size, angle } = footprint.bbox;
    if (!(size[0] > 0 && size[1] > 0)) {
      return;
    }
    const isBottom = footprint.layer === 'B';
    // iBom rotates footprint boxes by -angle in Y-down canvas space, which is +angle in the scene.
    const local = [relpos[0] + size[0] / 2, relpos[1] + size[1] / 2];
    const a = -angle * DEG;
    const centre = [
      parseFloat(pos[0]) + local[0] * Math.cos(a) - local[1] * Math.sin(a),
      parseFloat(pos[1]) + local[0] * Math.sin(a) + local[1] * Math.cos(a)
    ];
    const [x, y] = toScene(centre[0], centre[1]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * MM_PER_UNIT, size[1] * MM_PER_UNIT, PLACEHOLDER_HEIGHT),
      placeholderMaterial
    );
    mesh.position.set(x, y, isBottom ? -PLACEHOLDER_HEIGHT / 2 : BOARD_THICKNESS + PLACEHOLDER_HEIGHT / 2);
    mesh.rotation.z = angle * DEG;
    addPart(footprintIndex, mesh);
  };

  const buildParts = (models) => {
    const geometries = {};
    const materials = {};
    models.forEach((model) => {
      geometries[model.uuid] = buildModelGeometry(model);
      materials[model.uuid] = model.groups.map(group => partMaterial(group.colour));
    });

    const placements = (pcbdata.models3d && pcbdata.models3d.placements) || [];
    pcbdata.footprints.forEach((footprint, index) => {
      const placement = placements[index];
      const isBottom = footprint.layer === 'B';
      if (placement && geometries[placement.uuid]) {
        const mesh = new THREE.Mesh(geometries[placement.uuid], materials[placement.uuid]);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(placementMatrix(placement, isBottom, toScene));
        addPart(index, mesh);
      } else if (footprint.pads && footprint.pads.length > 0) {
        addPlaceholder(index, footprint);
        viewer.placeholderCount++;
      }
    });
    applyHighlight();
    requestRender();
  };

  // Highlighting: chosen parts glow, the rest fade out.
  let highlighted = [];
  const variant = (material, kind) => {
    material.userData.variants = material.userData.variants || {};
    if (!material.userData.variants[kind]) {
      const copy = material.clone();
      if (kind === 'highlight') {
        copy.emissive = new THREE.Color(COLOURS.highlight);
        copy.emissiveIntensity = 0.45;
      } else {
        copy.transparent = true;
        copy.opacity = 0.3;
        copy.depthWrite = false;
      }
      material.userData.variants[kind] = copy;
    }
    return material.userData.variants[kind];
  };

  const applyHighlight = () => {
    const active = new Set(highlighted);
    partsGroup.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      const base = child.userData.baseMaterial;
      const kind = active.size === 0 ? null : (active.has(child.userData.footprintIndex) ? 'highlight' : 'dim');
      const pick = material => (kind ? variant(material, kind) : material);
      child.material = Array.isArray(base) ? base.map(pick) : pick(base);
    });
    requestRender();
  };

  const highlight = (footprintIndexes) => {
    const next = (footprintIndexes || []).slice();
    if (next.length === highlighted.length && next.every((value, i) => value === highlighted[i])) {
      return;
    }
    highlighted = next;
    applyHighlight();
  };

  // Camera
  const boardSize = new THREE.Vector3(
    (bbox.maxx - bbox.minx) * MM_PER_UNIT,
    (bbox.maxy - bbox.miny) * MM_PER_UNIT,
    BOARD_THICKNESS
  );
  const fitDistance = () => {
    const radius = Math.max(boardSize.x, boardSize.y) / 2;
    const fov = camera.fov * DEG;
    const fitHeight = radius / Math.tan(fov / 2);
    const fitWidth = fitHeight / Math.max(camera.aspect, 0.01);
    return Math.max(fitHeight, fitWidth) * 1.3 + BOARD_THICKNESS;
  };

  const setView = (view) => {
    currentView = view;
    userMovedCamera = false;
    const distance = fitDistance();
    controls.target.set(0, 0, BOARD_THICKNESS / 2);
    switch (view) {
      case 'top':
        camera.position.set(0, -0.001, distance);
        break;
      case 'bottom':
        camera.position.set(0, -0.001, -distance);
        break;
      default:
        camera.position.set(0, -distance * 0.75, distance * 0.65);
    }
    camera.lookAt(controls.target);
    controls.update();
    requestRender();
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!userMovedCamera) {
      setView(currentView);
    }
    requestRender();
  };

  const setDarkMode = (dark) => {
    scene.background = new THREE.Color(dark ? COLOURS.dark.background : COLOURS.light.background);
    requestRender();
  };

  // Click (without dragging) on a part selects it.
  const raycaster = new THREE.Raycaster();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !options.onPick) {
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      (e.clientX - rect.left) / rect.width * 2 - 1,
      -(e.clientY - rect.top) / rect.height * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(partsGroup.children, true)
      .filter(hit => hit.object.visible && hit.object.userData.footprintIndex !== undefined);
    if (hits.length > 0) {
      options.onPick(hits[0].object.userData.footprintIndex);
    }
  });

  const loop = () => {
    if (needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(container);
  }
  window.addEventListener('resize', resize);

  setDarkMode(!!options.darkMode);
  resize();
  setView('iso');
  refreshTextures();
  loop();

  const ready = options.pcbmodels
    ? decodeModels(options.pcbmodels).catch((error) => {
      console.log('[iBom]: 3D models could not be loaded', error);
      return [];
    })
    : Promise.resolve([]);

  const viewer = {
    // Parts drawn as grey boxes because they have no (downloadable) 3D model.
    placeholderCount: 0,
    ready: ready.then((models) => {
      buildParts(models);
      return viewer;
    }),
    highlight,
    resize,
    setView,
    setDarkMode,
    refreshTextures
  };
  return viewer;
};

window.IBom3D = {
  isSupported,
  create: createViewer
};
