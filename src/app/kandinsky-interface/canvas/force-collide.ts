import { quadtree, SimulationNodeDatum, ForceCollide } from 'd3';
import jiggle from 'd3-force/src/jiggle';
import constant from 'd3-force/src/constant';

function x(d) {
  return d.x + d.vx;
}

function y(d) {
  return d.y + d.vy;
}

export interface CustomForceCollide<NodeDatum extends SimulationNodeDatum> extends ForceCollide<NodeDatum> {
  filter(filter: boolean | ((source: NodeDatum, target: NodeDatum) => boolean)): this;
}

/**
 * d3's force collide with the addition of a filter that determines if two nodes collide with each other.
 * 
 * @remarks
 * Ref: https://github.com/d3/d3-force/blob/main/src/collide.js
 * 
 * @param radius custom force radius. Default = `1`
 * @returns `CustomForceCollide` object
 */
export function customForceCollide<NodeDatum extends SimulationNodeDatum>(radius?) {
  var nodes,
  radii,
  strength = 1,
  iterations = 1,
  filter = (source: NodeDatum, target: NodeDatum) => true;

  if (typeof radius !== "function") {
    radius = constant(radius == null ? 1 : +radius);
  }
  
  function force() {
    var i;
    var n = nodes.length;
    var tree;
    var node: NodeDatum;
    var xi;
    var yi;
    var ri;
    var ri2;
    
    for (var k = 0; k < iterations; ++k) {
      tree = quadtree(nodes, x, y).visitAfter(prepare);
      for (i = 0; i < n; ++i) {
        node = nodes[i];
        ri = radii[node.index], ri2 = ri * ri;
        xi = node.x + node.vx;
        yi = node.y + node.vy;
        tree.visit(apply);
      }
    }
    
    function apply(quad, x0, y0, x1, y1) {
      var data = quad.data, rj = quad.r, r = ri + rj;
      if (data) {

        if (!filter(node, data)) {
          return;
        }

        if (data.index > node.index) {
          var x = xi - data.x - data.vx,
          y = yi - data.y - data.vy,
          l = x * x + y * y;
          if (l < r * r) {

            if (x === 0) x = jiggle(), l += x * x;
            if (y === 0) y = jiggle(), l += y * y;
            l = (r - (l = Math.sqrt(l))) / l * strength;
            node.vx += (x *= l) * (r = (rj *= rj) / (ri2 + rj));
            node.vy += (y *= l) * r;
            data.vx -= x * (r = 1 - r);
            data.vy -= y * r;
          }
        }
        return;
      }
      return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
    }
  }
  
  function prepare(quad) {
    if (quad.data) return quad.r = radii[quad.data.index];
    for (var i = quad.r = 0; i < 4; ++i) {
      if (quad[i] && quad[i].r > quad.r) {
        quad.r = quad[i].r;
      }
    }
  }
  
  function initialize() {
    if (!nodes) return;
    var i, n = nodes.length, node;
    radii = new Array(n);
    for (i = 0; i < n; ++i) {
      node = nodes[i];
      radii[node.index] = +radius(node, i, nodes);
    }
  }
  
  force.initialize = function(_) {
    nodes = _;
    initialize();
  };
  
  force.iterations = function(_) {
    return arguments.length ? (iterations = +_, force) : iterations;
  };
  
  force.strength = function(_) {
    return arguments.length ? (strength = +_, force) : strength;
  };
  
  force.radius = function(_: ((d: NodeDatum, i: number, group: NodeDatum[]) => number) | number) {
    return arguments.length ? (radius = typeof _ === "function" ? _ : constant(+_), initialize(), force) : radius;
  };

  force.filter = function(_ : ((source: NodeDatum, target: NodeDatum) => boolean) | boolean) {
    return arguments.length ? (filter = typeof _ === "function" ? _ : constant(+_), force) : filter;
  }
  
  return (force as unknown) as CustomForceCollide<NodeDatum>;
}