// Turns iBom's board edge drawings (EasyEDA canvas units) into closed loops.
// Segments and arcs are tessellated into polylines, then joined end to end into loops.

const JOIN_TOLERANCE = 0.5; // canvas units (0.127 mm)
const ARC_SEGMENT_ANGLE = Math.PI / 36;

const numbersIn = text => (String(text).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(parseFloat);

const pointsFromPolyline = (svgpath) => {
  const numbers = numbersIn(svgpath);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push([numbers[i], numbers[i + 1]]);
  }
  return points;
};

// SVG elliptical arc to points, following the SVG implementation notes (F.6.5).
const tessellateArc = (from, rx, ry, rotationDeg, largeArc, sweep, to) => {
  if (rx === 0 || ry === 0) {
    return [to];
  }
  const phi = rotationDeg * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cosPhi * dx + sinPhi * dy;
  const y1 = -sinPhi * dx + cosPhi * dy;

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = denominator === 0 ? 0 : Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) {
    factor = -factor;
  }
  const cx1 = factor * rx * y1 / ry;
  const cy1 = -factor * ry * x1 / rx;
  const cx = cosPhi * cx1 - sinPhi * cy1 + (from[0] + to[0]) / 2;
  const cy = sinPhi * cx1 + cosPhi * cy1 + (from[1] + to[1]) / 2;

  const angle = (ux, uy, vx, vy) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
  };
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) {
    delta -= 2 * Math.PI;
  } else if (sweep && delta < 0) {
    delta += 2 * Math.PI;
  }

  const steps = Math.max(2, Math.ceil(Math.abs(delta) / ARC_SEGMENT_ANGLE));
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta + delta * i / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    points.push([cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy]);
  }
  points[points.length - 1] = to;
  return points;
};

// Supports the M, L, H, V, A and Z commands EasyEDA uses for outline arcs.
const pointsFromPath = (svgpath) => {
  const tokens = String(svgpath).match(/[MLHVAZmlhvaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const points = [];
  let command = null;
  let current = null;
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      command = tokens[i++];
      if (command === 'Z' || command === 'z') {
        if (points.length) {
          points.push(points[0]);
        }
        continue;
      }
    }
    const relative = command === command.toLowerCase();
    const base = relative && current ? current : [0, 0];
    switch (command.toUpperCase()) {
      case 'M':
      case 'L':
        current = [base[0] + next(), base[1] + next()];
        points.push(current);
        break;
      case 'H':
        current = [(relative ? current[0] : 0) + next(), current[1]];
        points.push(current);
        break;
      case 'V':
        current = [current[0], (relative ? current[1] : 0) + next()];
        points.push(current);
        break;
      case 'A': {
        const rx = next();
        const ry = next();
        const rotation = next();
        const largeArc = next() !== 0;
        const sweep = next() !== 0;
        const to = [base[0] + next(), base[1] + next()];
        points.push(...tessellateArc(current || to, rx, ry, rotation, largeArc, sweep, to));
        current = to;
        break;
      }
      default:
        i++;
    }
  }
  return points.filter(point => isFinite(point[0]) && isFinite(point[1]));
};

const close = (a, b) => Math.abs(a[0] - b[0]) <= JOIN_TOLERANCE && Math.abs(a[1] - b[1]) <= JOIN_TOLERANCE;

const joinLoops = (polylines) => {
  const pending = polylines.filter(line => line.length >= 2).map(line => line.slice());
  const loops = [];

  while (pending.length) {
    let chain = pending.shift();
    let extended = true;
    while (extended && !close(chain[0], chain[chain.length - 1])) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const line = pending[i];
        const end = chain[chain.length - 1];
        if (close(end, line[0])) {
          chain = chain.concat(line.slice(1));
        } else if (close(end, line[line.length - 1])) {
          chain = chain.concat(line.slice(0, -1).reverse());
        } else if (close(chain[0], line[line.length - 1])) {
          chain = line.slice(0, -1).concat(chain);
        } else if (close(chain[0], line[0])) {
          chain = line.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (chain.length >= 4 && close(chain[0], chain[chain.length - 1])) {
      loops.push(chain.slice(0, -1));
    }
  }
  return loops;
};

export const polygonArea = (points) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
};

export const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
};

const circlePoints = (centre, radius) => {
  const steps = Math.max(16, Math.min(64, Math.ceil(radius * 2)));
  const points = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps * Math.PI * 2;
    points.push([centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t)]);
  }
  return points;
};

// Returns { outer: [[x, y]...], holes: [[[x, y]...]...] } in canvas units,
// or null when no closed outline could be found.
export const buildBoardOutline = (edges) => {
  const polylines = [];
  const circles = [];
  (edges || []).forEach((edge) => {
    if (!edge) {
      return;
    }
    if (edge.type === 'circle') {
      // EasyEDA values can arrive as strings.
      const radius = parseFloat(edge.radius);
      const centre = [parseFloat(edge.start[0]), parseFloat(edge.start[1])];
      if (radius > 0 && isFinite(centre[0]) && isFinite(centre[1])) {
        circles.push(circlePoints(centre, radius));
      }
    } else if (edge.type === 'polyline' && edge.svgpath) {
      polylines.push(pointsFromPolyline(edge.svgpath));
    } else if (edge.svgpath) {
      polylines.push(pointsFromPath(edge.svgpath));
    } else if (edge.start && edge.end) {
      polylines.push([edge.start, edge.end]);
    }
  });

  const loops = joinLoops(polylines).concat(circles);
  if (!loops.length) {
    return null;
  }

  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  const outer = loops[0];
  const holes = loops.slice(1).filter(loop => pointInPolygon(loop[0], outer));
  return { outer, holes };
};
