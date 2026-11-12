import * as THREE from 'three';

export const MM_PER_UNIT = 0.254;
export const BOARD_THICKNESS = 1.6;
const DEG = Math.PI / 180;

// EasyEDA models are XY-centred and sit on Z = 0 (easyeda-step's convention).
export const normaliseMatrix = (model) => {
  return new THREE.Matrix4().makeTranslation(
    -(model.min[0] + model.max[0]) / 2,
    -(model.min[1] + model.max[1]) / 2,
    -model.min[2]
  );
};

// Model → footprint → side → board, as in easyeda-step's embedded placement:
// rotate about X (-rx) and Y (ry), flip bottom parts about X, rotate about Z,
// then move to the board position. EasyEDA adds 180° to the Z rotation of
// bottom models; the flip already supplies that, so it is removed.
export const placementMatrix = (placement, isBottom, toScene) => {
  const [rx, ry, rz] = placement.rotation;
  const [x, y] = toScene(placement.origin[0], placement.origin[1]);
  const z = placement.z * MM_PER_UNIT;
  const position = new THREE.Vector3(x, y, isBottom ? -z : BOARD_THICKNESS + z);

  const matrix = new THREE.Matrix4().makeTranslation(position.x, position.y, position.z);
  matrix.multiply(new THREE.Matrix4().makeRotationZ((rz - (isBottom ? 180 : 0)) * DEG));
  if (isBottom) {
    matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  }
  matrix.multiply(new THREE.Matrix4().makeRotationY(ry * DEG));
  matrix.multiply(new THREE.Matrix4().makeRotationX(-rx * DEG));
  return matrix;
};
