import { quadtree, SimulationNodeDatum, ForceManyBody } from 'd3';
import jiggle from 'd3-force/src/jiggle';
import constant from 'd3-force/src/constant';
import { x, y } from 'd3-force/src/simulation';

export interface CustomForceManyBody<NodeDatum extends SimulationNodeDatum> extends ForceManyBody<NodeDatum> {
  filter(filter: boolean | ((source: NodeDatum, target: NodeDatum) => boolean)): this;
}

/**
 * d3's many-body force with the addition of a filter that determines if two nodes exert forces on each other.
 * 
 * @remarks
 * Ref: https://github.com/d3/d3-force/blob/main/src/manyBody.js
 * 
 * @returns `CustomForceManyBody` object
 */
export function customForceManyBody<NodeDatum extends SimulationNodeDatum>() {
  var nodes,
  node,
  alpha,
  strength = constant(-30),
  strengths,
  distanceMin2 = 1,
  distanceMax2 = Infinity,
  theta2 = 0.81,
  filter = (source: NodeDatum, target: NodeDatum) => true;
  
  function force(_) {
    var i, n = nodes.length, tree = quadtree(nodes, x, y).visitAfter(accumulate);
    for (alpha = _, i = 0; i < n; ++i) node = nodes[i], tree.visit(apply);
  }
  
  function initialize() {
    if (!nodes) return;
    var i, n = nodes.length, node;
    strengths = new Array(n);
    for (i = 0; i < n; ++i) node = nodes[i], strengths[node.index] = +strength(node, i, nodes);
  }
  
  function accumulate(quad) {
    var strength = 0, q, c, weight = 0, x, y, i;
    
    // For internal nodes, accumulate forces from child quadrants.
    if (quad.length) {
      for (x = y = i = 0; i < 4; ++i) {
        if ((q = quad[i]) && (c = Math.abs(q.value))) {
          strength += q.value, weight += c, x += c * q.x, y += c * q.y;
        }
      }
      quad.x = x / weight;
      quad.y = y / weight;
    }
    
    // For leaf nodes, accumulate forces from coincident quadrants.
    else {
      q = quad;
      q.x = q.data.x;
      q.y = q.data.y;
      do strength += strengths[q.data.index];
      while (q = q.next);
    }
    
    quad.value = strength;
  }
  
  function apply(quad, x1, _, x2) {
    if (!quad.value) return true;

    if (quad.data && !filter(node, quad.data)) {
      return true;
    }
    
    var x = quad.x - node.x,
    y = quad.y - node.y,
    w = x2 - x1,
    l = x * x + y * y;
    
    // Apply the Barnes-Hut approximation if possible.
    // Limit forces for very close nodes; randomize direction if coincident.
    if (w * w / theta2 < l) {
      if (l < distanceMax2) {
        if (x === 0) x = jiggle(), l += x * x;
        if (y === 0) y = jiggle(), l += y * y;
        if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
        node.vx += x * quad.value * alpha / l;
        node.vy += y * quad.value * alpha / l;
      }
      return true;
    }
    
    // Otherwise, process points directly.
    else if (quad.length || l >= distanceMax2) return;
    
    // Limit forces for very close nodes; randomize direction if coincident.
    if (quad.data !== node || quad.next) {
      if (x === 0) x = jiggle(), l += x * x;
      if (y === 0) y = jiggle(), l += y * y;
      if (l < distanceMin2) l = Math.sqrt(distanceMin2 * l);
    }
    
    do if (quad.data !== node) {
      w = strengths[quad.data.index] * alpha / l;
      node.vx += x * w;
      node.vy += y * w;
    } while (quad = quad.next);
  }
  
  force.initialize = function(_) {
    nodes = _;
    initialize();
  };
  
  force.strength = function(_) {
    return arguments.length ? (strength = typeof _ === "function" ? _ : constant(+_), initialize(), force) : strength;
  };
  
  force.distanceMin = function(_) {
    return arguments.length ? (distanceMin2 = _ * _, force) : Math.sqrt(distanceMin2);
  };
  
  force.distanceMax = function(_) {
    return arguments.length ? (distanceMax2 = _ * _, force) : Math.sqrt(distanceMax2);
  };
  
  force.theta = function(_) {
    return arguments.length ? (theta2 = _ * _, force) : Math.sqrt(theta2);
  };

  force.filter = function(_ : ((source: NodeDatum, target: NodeDatum) => boolean) | boolean) {
    return arguments.length ? (filter = typeof _ === "function" ? _ : constant(+_), force) : filter;
  }
  
  return (force as unknown) as CustomForceManyBody<NodeDatum>;
}