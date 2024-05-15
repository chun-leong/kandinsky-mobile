import { Component, OnInit, OnChanges, SimpleChanges, Input, EventEmitter, Output } from '@angular/core';
import { Selection, ScalePower, ZoomBehavior } from 'd3';
import ColorHash from 'color-hash';
import { customForceCollide } from './force-collide';
import * as d3 from 'd3';
import _ from 'lodash';
import { customForceManyBody } from './force-many-body';
import { SCALE_MULTIPLIER, MIN_CIRCLE_RADIUS, MAX_CIRCLE_RADIUS, LAYOUT_PADDING, FORCE_STRENGTH, COLLIDE_PADDING, COLOR_STRING_RED, COLOR_STRING_WHITE } from 'src/app/config';
import { SocialComment } from 'src/app/models/models';
import { underscoreJoin, isConcentricCircleDatum } from 'src/app/utils';

/**
 * Component responsible for the visualisation of comment data as concentric circles.
 */
@Component({
  selector: 'ksky-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent implements OnInit, OnChanges {

  @Input()
  timestamp: number;

  @Input()
  isHighlightModeOn: boolean;

  @Input()
  isFocusModeOn: boolean;

  @Input()
  selectedConcentricCircle: ConcentricCircle;

  @Output()
  selectConcentricCircleEvent: EventEmitter<ConcentricCircle>;

  @Output()
  onReady: EventEmitter<void>;

  private circlesByTimestamp: Circle[];  // C
  private shapeBuckets: ConcentricCircle[]; // S
  private concentricCircles: ConcentricCircle[];

  private lastDisplayedProgress: number = -1;

  private readonly SCALE_MULTIPLIER: number = SCALE_MULTIPLIER;
  private readonly MIN_CIRCLE_RADIUS: number = MIN_CIRCLE_RADIUS;
  private readonly MAX_CIRCLE_RADIUS: number = MAX_CIRCLE_RADIUS;
  private readonly LAYOUT_PADDING: number = LAYOUT_PADDING;
  private readonly FORCE_STRENGTH: number = FORCE_STRENGTH;
  private readonly COLLIDE_PADDING: number = COLLIDE_PADDING;
  private readonly SELECT_BOX_SELECTED_COLOR: string = COLOR_STRING_RED;
  private readonly SELECT_BOX_FOCUSED_COLOR: string = COLOR_STRING_WHITE;

  private readonly CLASS = {
    CONTAINER: 'container',
    CLICK_NET: 'click-net',
    CIRCLE: 'circle',
    CONCENTRIC_CIRCLE: 'concentric-circle',
    SELECT_BOX: 'select-box',
  };

  private readonly PREFIX = {
    CONCENTRIC_CIRCLE: 'concentric-circle',
    CIRCLE: 'circle',
  };
  
  private container: Selection<SVGGElement, any, HTMLElement, any>;
  private zoom: ZoomBehavior<SVGElement, unknown>;
  private svg: Selection<SVGElement, unknown, HTMLElement, unknown>;

  private radiusScale: ScalePower<number, number>;
  private graph: KandinskyGraph<ConcentricCircle, ConcentricCircleDatumLink>;
  private concentricCirclesSvg: Selection<SVGGElement, ConcentricCircle, SVGGElement, unknown>;

  private width: number;
  private height: number;
  private center: { x: number, y: number };
  private maxScale: number;

  private minLikeCount: number;
  private maxLikeCount: number;

  private colorHash: ColorHash;

  constructor() {
    this.colorHash = new ColorHash();
    this.selectConcentricCircleEvent = new EventEmitter();
    this.onReady = new EventEmitter();
  }

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.timestamp) {
      this.updateDisplayedCirclesByTimestamp(this.timestamp);
    }
  }

  /**
   * Implements the map operator in the abstraction model.
   * @param circles Array of circles representing all the comments of a social post.
   * @returns The circles representing root comments of the social post (comments directly replying the social post).
   */
  private map(circles: Circle[]): Circle[] {
    const roots = [];
    circles.reduce((map, circle) => {
      map.set(circle.rawCircleData.id, circle);

      let parentCircle: Circle;

      if (circle.rawCircleData.parentCommentId && (parentCircle = map.get(circle.rawCircleData.parentCommentId))) {
        parentCircle.children.push(circle);
      } else {
        roots.push(circle);
      }

      return map;
    }, new Map());

    return roots;
  }

  /**
   * Implements the paint operator in the abstraction model.
   * @param buckets The array of circles representing root comments.
   * @returns The painted shape buckets.
   */
  private paint(buckets: Circle[]): ConcentricCircle[] {
    const likeCountDomain = d3.extent(this.circlesByTimestamp, circle => circle.rawCircleData.likeCount);
  
    this.minLikeCount = likeCountDomain[0];
    this.maxLikeCount = likeCountDomain[1];
  
    this.radiusScale = d3.scaleSqrt()
      .domain([this.minLikeCount, this.maxLikeCount])
      .range([this.MIN_CIRCLE_RADIUS, this.MAX_CIRCLE_RADIUS]);

    buckets.forEach(bucket => this.paintCircle(bucket));

    return buckets.map(pivotCircle => this.paintConcentricCircle(pivotCircle));
  }

  /**
   * Supplements visual data for an individual circle.
   * @param pivot The circle to paint.
   * @param radiusOffset The number of pixels to add to the radius of the circle.
   * @param isPivot Indicate if the circle is a pivot circle.
   * @param innerParentId The ID of the circle that this comment replies to.
   */
  private paintCircle(pivot: Circle, radiusOffset: number = 0, {
      isPivot = true,
      innerParentId = null
    } = {}): void {
    
    pivot.color = this.colorHash.hex(pivot.rawCircleData.authorName);
    pivot.radius = this.calculateRadius(pivot.rawCircleData.likeCount, radiusOffset);
    pivot.isPivot = isPivot
    pivot.innerParentId = innerParentId;

    let innerInnerParentId = innerParentId || pivot.id;
    radiusOffset = pivot.radius;

    pivot.children.forEach(childCircle => {
      this.paintCircle(childCircle, radiusOffset, {isPivot: false, innerParentId: innerInnerParentId});

      // Save current circle info to pass into the next child comment in the thread
      innerInnerParentId = childCircle.id;
      radiusOffset = childCircle.radius;
    });
  }

  /**
   * Constructs a `ConcentricCircleDatum` object from a `CircleDatum`.
   * @param pivot The top-level circle.
   * @param isNucleus Indicates if this circle represents the main thread (`true` if main thread, `false` if peripheral).
   * @param radiusOffset Amount to adjust the radius of the circles in this concentric circles by.
   * @param rootConcentricCircleId ID of the concentric circles of the main thread.
   * @param parentId ID of the immediate concentric circles parent.
   * @returns `ConcentricCircleDatum` object.
   */
  private paintConcentricCircle(pivot: Circle, radiusOffset: number = 0, {
    rootConcentricCircleId = null,
    parentId = null,
    isNucleus = true
  } = {}): ConcentricCircle {

    const id = underscoreJoin(this.PREFIX.CONCENTRIC_CIRCLE, pivot.rawCircleData.id);
    rootConcentricCircleId = rootConcentricCircleId || id;

    const peripherals = [];

    // concentric circle's radius starting with the pivot
    let radius = pivot.radius;

    // if child is a peripheral, offset the child's radius with this
    let childRadiusOffset = radius * -1;

    let innerParentId = pivot.id;

    pivot.concentricCircleId = id;
    pivot.children.forEach(child => {

      // update concentric circle id
      child.concentricCircleId = id;
      child.radius += radiusOffset;
      child.innerParentId = innerParentId;
      innerParentId = child.id;

      // set concentric circle's radius as largest child radius
      radius = child.radius;

      // check if has peripheral children
      if (child.children.length > 0) {

        // clone child circle as new peripheral's pivot
        const childPivot = _.clone(child);
        
        childPivot.isPivot = true;
        childPivot.id = underscoreJoin(this.PREFIX.CIRCLE, child.rawCircleData.id);
        childPivot.radius += childRadiusOffset;

        // build new peripheral circle
        const peripheral = this.paintConcentricCircle(childPivot, childRadiusOffset + radiusOffset, {isNucleus: false, rootConcentricCircleId, parentId: id});
        child.children = peripheral.pivot.children;
        peripherals.push(peripheral);
      }

      // update child radius offset
      childRadiusOffset = radius * -1;
    });
    
    return {
      id,
      x: this.center.x,
      y: this.center.y,
      fx: null,
      fy: null,
      radius,
      peripherals,
      rootConcentricCircleId: rootConcentricCircleId,
      parentConcentricCircleId: parentId,
      isNucleus,
      isSelected: false,
      isFocused: false,
      isDisplayed: false,
      pivot
    }
  }

  /**
   * Supplements visual data for the like bar when displaying comment information.
   * @param circle The circle whose comment is being displayed.
   * @param linearScale The scale used to calculate the bar width.
   * @param isDomainSet Indicates if the domain for the scale is set. If the domain is not set, the like counts for the comment thread 
   * that this circle belongs to will be used.
   * @returns Bar properties including colour and width.
   */
  public paintCommentBar(circle: Circle, linearScale: d3.ScaleLinear<number, number>, isDomainSet: boolean = false): {color, width} {
    if (!isDomainSet) {
      const concentricCircle = this.getDatum(circle.concentricCircleId) as ConcentricCircle;
      const likeCountDomain = d3.extent(this.getLikeCounts(concentricCircle));
      linearScale.domain([likeCountDomain[0], likeCountDomain[1]]);
    }

    return {
      color: circle.color,
      width: linearScale(circle.rawCircleData.likeCount)
    }
  }

  /**
   * Implements the balance operator of the abstraction model.
   * @param concentricCircle Optional argument. When given, the balance operator zooms in on 
   * the specific element on the canvas. When not given, the balance operator repositions the 
   * entities on the canvas for user friendliness.
   */
  private balance(concentricCircle?: ConcentricCircle): void {
    if (concentricCircle) {
      this.zoomTo(concentricCircle);
      return;
    }

    console.time("Drawing canvas - 3");
  
    const forceManyBody = customForceManyBody<ConcentricCircle>()
      .filter((source, target) => source.rootConcentricCircleId == target.rootConcentricCircleId && !this.isImmediateRelativeOf(source, target))
      .strength(d => d.radius * -60);

    const forceLink = d3.forceLink<ConcentricCircle, ConcentricCircleDatumLink>()
      .id(d => d.id)
      .distance(d => {
        const source = d.source as ConcentricCircle;
        const target = d.target as ConcentricCircle;
        return Math.max(source.radius, target.radius);
        // return source.radius + target.radius;
      })
      .strength(0.2)
      .links(this.graph.links);
    
    const forceX = d3.forceX<ConcentricCircle>(this.center.x).strength(this.FORCE_STRENGTH);
    const forceY = d3.forceY<ConcentricCircle>(this.center.y).strength(this.FORCE_STRENGTH);
  
    console.timeEnd("Drawing canvas - 3");
    console.time("Drawing canvas - 4");

    const forceImmediateRelativeCollide = customForceCollide<ConcentricCircle>()
      .filter((source, target) => source.rootConcentricCircleId == target.rootConcentricCircleId && this.isImmediateRelativeOf(source, target))
      .radius(d => d.radius - 2);

    const forceRelativeCollide = customForceCollide<ConcentricCircle>()
      .filter((source, target) => source.rootConcentricCircleId == target.rootConcentricCircleId && !this.isImmediateRelativeOf(source, target))
      .radius(d => d.radius);
    
    const forceCollide = customForceCollide<ConcentricCircle>()
      .filter((source, target) => source.rootConcentricCircleId != target.rootConcentricCircleId)
      .radius(d => d.radius + 30);

    console.timeEnd("Drawing canvas - 4");
    console.time("Drawing canvas - 5");

    // separate link simulation
    const linkSimulation = d3.forceSimulation<ConcentricCircle, ConcentricCircleDatumLink>()
      .alphaTarget(1) // will run this simulation forever since alphaTarget > alphaMin; need to stop manually
      .force('link', forceLink)
      .stop();
    
      console.timeEnd("Drawing canvas - 5");
      console.time("Drawing canvas - 6");

    const simulation = d3.forceSimulation<ConcentricCircle, ConcentricCircleDatumLink>()
      .force('manybody', forceManyBody)
      .force('x', forceX)
      .force('y', forceY)
      .force('immediaterelativecollide', forceImmediateRelativeCollide)
      .force('relativecollide', forceRelativeCollide)
      .force('collide', forceCollide)
      .alpha(10)
      .nodes(this.graph.nodes)
      .stop();

      console.timeEnd("Drawing canvas - 6");
      console.time("Drawing canvas - 7");
      
      for(let i = 0; i < 400; i++) {
        linkSimulation.tick();
        simulation.tick();
      }

      console.timeEnd("Drawing canvas - 7");
      console.time("Drawing canvas - 8");
 
      this.concentricCirclesSvg
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
      console.timeEnd("Drawing canvas - 8");

      this.update(Operation.Balance);
  }

  /**
   * Implements the update operator of the abstraction model.
   * @param operation The operation to update canvas for.
   */
  private update(operation: Operation): void {
    if (operation === Operation.Balance || operation === Operation.Lookup || operation === Operation.Retrieve) {
      this.redrawConcentricCircles();
    } else if (operation === Operation.Paint) {
      this.balance();
    }
  }

  /**
   * Constructs the Kandinsky canvas from the comments of a post.
   * @param comments The array of comments of a social post.
   */
  public constructCanvas(comments: SocialComment[]): void {
    this.prepareLayout();
        
    this.circlesByTimestamp = comments.map((socialComment, index) => this.buildCircle(socialComment, index));
 
    const buckets = this.map(this.circlesByTimestamp);
    console.timeEnd("Canvas preparation time");

    console.time("Canvas drawing time");
    this.shapeBuckets = this.paint(buckets);

    this.createCanvasEntities();

    this.update(Operation.Paint);
    console.timeEnd("Canvas drawing time");
    this.onCanvasReady();
  }
    
  /** Assign references to the HTML elements in the component for ease of access in the class functions. */
  private prepareLayout(): void {
    this.svg = d3.select<SVGElement, unknown>('svg.main-canvas')
      .style('background-color', '#212121');

    if (this.container) {
      this.container.remove();
    }
    
    this.svg.append('rect')
      .attr('class', this.CLASS.CLICK_NET)
      .attr('width', this.svg.property('clientWidth'))
      .attr('height', this.svg.property('clientHeight'))
      .style('fill', 'transparent')
      .on('click', () => this.select());

    this.width = this.svg.property('clientWidth');
    this.height = this.svg.property('clientHeight');

    this.container = this.svg
      .append('g')
      .attr('class', this.CLASS.CONTAINER);

    this.zoom = d3.zoom<SVGElement, unknown>()
      .on('zoom', () => {        
        this.container.attr("transform", d3.event.transform);
      });    
    this.svg.call(this.zoom);

    this.center = {
      x: this.width * 0.5,
      y: this.height * 0.5
    };
  }

  /** Builds the HTML elements of the Kandinsky canvas for the shape buckets saved in the canvas component. */
  private createCanvasEntities():void {
  
    this.graph = this.buildGraph(this.shapeBuckets);
    this.concentricCircles = this.graph.nodes;
  
    this.concentricCirclesSvg = this.container.selectAll(`.${this.CLASS.CONCENTRIC_CIRCLE}`)
      .data(this.graph.nodes)
      .enter()
      .append('g')
      .classed(this.CLASS.CONCENTRIC_CIRCLE, true)
      .attr('id', d => d.id)
      .each(concentricCircleDatum => {
        const concentricCircle = this.getDatumElement(concentricCircleDatum.id) as Selection<SVGGElement, ConcentricCircle, HTMLElement, any>;
        concentricCircle.selectAll(`.${this.CLASS.CIRCLE}`)
          .data([concentricCircleDatum.pivot, ...concentricCircleDatum.pivot.children])
          .enter()
          .append('circle')
          .classed(this.CLASS.CIRCLE, true)
          .attr('id', d => d.id)
          .attr('r', d => d.radius)
          .style('fill', d => d.color)
          .style('opacity', '0')
          .lower();
  
        concentricCircle.append('rect')
          .classed(this.CLASS.SELECT_BOX, true)
          .style('fill', 'transparent')
          .style('pointer-events', 'none')
          .style('opacity', '0');
      })
      .on('click', d => this.select(d));  
  }

  /**
   * Constructs a `Circle` object from a `SocialComment`.
   * @param comment Comment to convert.
   * @param radiusOffset Amount to adjust the radius of this comment by.
   * @param isPivot Indicates if this circle is the top-level comment.
   * @returns `Circle` object.
   */
  private buildCircle(comment: SocialComment, index: number): Circle {

    const id = underscoreJoin(this.PREFIX.CIRCLE, comment.id);

    return {
      id,
      index,
      x: null,
      y: null,
      fx: null,
      fy: null,
      color: null,
      children: [],
      radius: null,
      isPivot: false,
      innerParentId: null,
      concentricCircleId: null, // to be populated by concentric circle painter
      isDisplayed: false,
      isFocused: false,
      isHighlighted: false,
      rawCircleData: comment,
    };
  }

  /**
   * Obtain the graph object from an array of concentric circles.
   * @param ConcentricCircleDatums Concentric circles that make up the graph.
   * @returns `nodes` and `links` of the graph.
   */
  private buildGraph(ConcentricCircleDatums: ConcentricCircle[]): KandinskyGraph<ConcentricCircle, ConcentricCircleDatumLink> {
    const nodes: ConcentricCircle[] = [];
    const links: ConcentricCircleDatumLink[] = [];

    const root = d3.hierarchy({ peripherals: ConcentricCircleDatums }, ConcentricCircleDatum => ConcentricCircleDatum.peripherals);
    root.children.forEach(childNode => {
      childNode.eachBefore(n => {
        nodes.push(n.data as ConcentricCircle);
        links.push(...n.links()
          .map<ConcentricCircleDatumLink>(link => ({
            source: link.source.data as ConcentricCircle,
            target: link.target.data as ConcentricCircle
          }))
        );
      });
    });

    return { nodes, links };
  }

  /** Notifies other components when the canvas has completed rendering. */
  private onCanvasReady(): void {
    const containerWidth = this.container.node().getBBox().width;
    this.maxScale = (this.width / containerWidth) * this.SCALE_MULTIPLIER;
    this.resetZoom();
    this.onReady.emit();
  }

  /**
   * Selects a concentric circles by displaying a red bounding box around it.
   * @param concentricCircleDatum The concentric circle to select. If no value is provided, unselects all concentric circles.
   */
  public select(concentricCircleDatum: ConcentricCircle = null): void {

    if ((concentricCircleDatum && !concentricCircleDatum.isDisplayed) || 
    (!concentricCircleDatum && !this.selectedConcentricCircle)) {
      return;
    }

    if (concentricCircleDatum && this.selectedConcentricCircle && this.selectedConcentricCircle.id === concentricCircleDatum.id) {
      this.selectConcentricCircleEvent.emit(concentricCircleDatum);
      this.balance(concentricCircleDatum);
      return;
    }

    this.concentricCirclesSvg.interrupt();

    if(this.selectedConcentricCircle) {
      Object.assign(this.selectedConcentricCircle, {isSelected: false, fx: null, fy: null});
    }

    this.selectConcentricCircleEvent.emit(concentricCircleDatum);

    this.selectedConcentricCircle = concentricCircleDatum;

    console.log(concentricCircleDatum);

    if(concentricCircleDatum) {
      concentricCircleDatum.isSelected = true;
      setTimeout(() => {
        this.update(Operation.Retrieve);
      });
      this.balance(concentricCircleDatum);
    } else {
      setTimeout(() => {
        this.update(Operation.Retrieve);
      });
    }
  }

  /**
   * Selects a concentric circles by displaying a red bounding box around it on the canvas.
   * @param pivotId The ID of the pivot `CircleDatum` of the concentric circles.
   */
  public selectByPivotId(pivotId: string): void {

    if (!pivotId) {
      this.select();
      return;
    }

    const concentricCircleId = underscoreJoin(this.PREFIX.CONCENTRIC_CIRCLE, pivotId);
    
    return this.select(this.getDatum(concentricCircleId) as ConcentricCircle);
  }

  /**
   * Focuses on a set of circles. Focused circles appear sharper while unfocused ones are blurred.
   * @param circleIds The IDs of circles to place focus on.
   */
  public setFocused(circleIds: string[]): void {

    const focusedCircleIds = new Set(circleIds);
    const focusedConcentricCircleIds = new Set();

    this.circlesByTimestamp.forEach(circleDatum => {
        circleDatum.isFocused = focusedCircleIds.has(circleDatum.rawCircleData.id);
        if (circleDatum.isFocused) {
          focusedConcentricCircleIds.add(circleDatum.concentricCircleId);
        }
    });

    this.concentricCircles.forEach(concentricCircleDatum => {
      concentricCircleDatum.isFocused = focusedConcentricCircleIds.has(concentricCircleDatum.id);
    });
    
    setTimeout(() => {
      this.update(Operation.Lookup);
    });
  }

  /**
   * Highlights a set of circles. Highlighted circles appear brighter while unhighlighted ones are dimmed.
   * @param circleIds The IDs of circles to highlight.
   */
  public setHighlighted(circleIds: string[]): void {
    const setCircleIds = new Set(circleIds);
    this.circlesByTimestamp.forEach(circleDatum => {
      circleDatum.isHighlighted = setCircleIds.has(circleDatum.rawCircleData.id);
      const concentricCircleDatum = this.getDatum(circleDatum.concentricCircleId) as ConcentricCircle;

      if (!concentricCircleDatum.isNucleus && !circleDatum.isPivot && circleDatum.innerParentId === concentricCircleDatum.pivot.id) {
        concentricCircleDatum.pivot.isHighlighted = setCircleIds.has(circleDatum.innerParentId);
      }
    });
    
    setTimeout(() => {
      this.update(Operation.Lookup);
    });
  }

  /**
   * Sets the visibility of a target circle (and its concentric circles) on the canvas.
   * @param circleDatum Circle to set visibility of.
   * @param shouldDisplay Indicates if circle should be displayed.
   * @param concentricCircleDatum Reference to the concentric circles that the circle belongs to. If no value is provided, this function selects it from the DOM.
   */
  private setCircleVisibility(circleDatum: Circle, shouldDisplay: boolean, concentricCircleDatum?: ConcentricCircle): void {
    circleDatum.isDisplayed = shouldDisplay;

    const circleElement = this.getDatumElement(circleDatum.id) as Selection<SVGCircleElement, Circle, HTMLElement, any>;

    circleElement.transition()
      .duration(250)
      .ease(d3.easeLinear)
      .style('opacity', shouldDisplay ? 1 : 0);

    if (circleDatum.isPivot) {
      return;
    }

    if (!concentricCircleDatum || circleDatum.concentricCircleId !== concentricCircleDatum.id) {
      concentricCircleDatum = this.concentricCircles.find(concentricCircle => concentricCircle.id === circleDatum.concentricCircleId);
    }

    if (shouldDisplay && !concentricCircleDatum.pivot.isDisplayed && circleDatum.innerParentId === concentricCircleDatum.pivot.id) {
      this.setCircleVisibility(concentricCircleDatum.pivot, true);
    } else if (!shouldDisplay && !concentricCircleDatum.isNucleus && concentricCircleDatum.pivot.isDisplayed && circleDatum.innerParentId === concentricCircleDatum.pivot.id) {
      this.setCircleVisibility(concentricCircleDatum.pivot, false);
    }
  }

  /**
   * Returns a reference to a `CircleDatum` or `ConcentricCircleDatum` HTML element by selecting from the DOM.
   * @param datumHtmlId HTML ID of datum element to select.
   * @returns `d3.Selection` with 0 or 1 element, depending if the element was found.
   */
  private getDatumElement(datumHtmlId: string): datumSelectionTypes {
    const escapedId = datumHtmlId.replace('.', '\\.');
    return d3.select(`#${escapedId}`) as datumSelectionTypes;
  }

  /**
   * Returns a reference to a `CircleDatum` or `ConcentricCircleDatum` by selecting from the DOM.
   * @param datumHtmlId HTML ID of datum element to select.
   * @returns The datum object or null if the element was not found.
   */
  private getDatum(datumHtmlId: string): datumTypes {
    const selection = this.getDatumElement(datumHtmlId);
    return selection.empty() ? null : this.getDatumElement(datumHtmlId).datum();
  }

  /**
   * Returns the references to the specified circles.
   * @param circleIds The IDs of circles to retrieve.
   * @returns Array of `CircleDatum`.
   */
  public getCircleData(circleIds: string[]): Circle[] {
    const setCircleIds = new Set(circleIds);

    return this.circlesByTimestamp
      .filter(circleDatum => setCircleIds.has(circleDatum.rawCircleData.id));
  }

  /** Reloads the circles on the canvas UI. */
  private redrawConcentricCircles(): void {

    const anyIsFocusedOrSelected = this.isFocusModeOn || this.concentricCircles.filter(concentricCircle => concentricCircle.isSelected || concentricCircle.isFocused).length;
    const defaultConcentricCircleOpacity = anyIsFocusedOrSelected ? 0.5 : 1;
    const defaultCircleOpacity = this.isHighlightModeOn ? 0.01 : 1;

    this.concentricCirclesSvg
      .select(`.${this.CLASS.SELECT_BOX}`)
        .transition()
          .duration(250)
          .ease(d3.easeLinear)
          .style('opacity', d => ((d.isSelected || d.isFocused) && d.isDisplayed) ? 1 : 0)
          .style('stroke', c => c.isSelected ? this.SELECT_BOX_SELECTED_COLOR : this.SELECT_BOX_FOCUSED_COLOR)

    this.concentricCirclesSvg
      .transition()
        .duration(250)
        .ease(d3.easeLinear)
        .style('opacity', d => d.isDisplayed ? ((d.isSelected || d.isFocused) ? 1 : defaultConcentricCircleOpacity) : 0);
    
    this.concentricCirclesSvg
      .selectAll<SVGCircleElement, Circle>(`.${this.CLASS.CIRCLE}`)
        .transition()
          .duration(250)
          .ease(d3.easeLinear)
          .style('opacity', d => d.isDisplayed ? (d.isHighlighted ? 1 : defaultCircleOpacity) : 0);
  }

  /**
   * Updates the canvas to display comments up to the timeline's current progress.
   * @param timestamp Comments up to this time are displayed.
   */
  private updateDisplayedCirclesByTimestamp(timestamp: number): void {
    const newProgress = this.timestampToProgress(timestamp);

    if (newProgress === this.lastDisplayedProgress) {
      return;
    }

    const updatedConcentricCircles = new Set<ConcentricCircle>();

    if (newProgress > this.lastDisplayedProgress) {

      // fast-forward
      // update all those circles from lastIndex -> newIndex
      while (this.lastDisplayedProgress < newProgress) {
        
        const circleDatum = this.circlesByTimestamp[++this.lastDisplayedProgress];
        const concentricCircle = this.concentricCircles.find(concentricCircle => concentricCircle.id === circleDatum.concentricCircleId);

        this.setCircleVisibility(circleDatum, true, concentricCircle);
        updatedConcentricCircles.add(concentricCircle);
      }
    } else {

      // rewind
      // update all those circles from newIndex -> lastIndex
      while (this.lastDisplayedProgress > newProgress) {

        const circleDatum = this.circlesByTimestamp[this.lastDisplayedProgress--];
        const concentricCircle = this.concentricCircles.find(concentricCircle => concentricCircle.id === circleDatum.concentricCircleId);
        
        this.setCircleVisibility(circleDatum, false, concentricCircle);
        updatedConcentricCircles.add(concentricCircle);
      }
    }

    updatedConcentricCircles.forEach(concentricCircleDatum => {
        this.resizeSelectBox(concentricCircleDatum);
  
        const circleDatums = [concentricCircleDatum.pivot, ...concentricCircleDatum.pivot.children];
        concentricCircleDatum.isFocused = circleDatums.some(circleDatum => circleDatum.isFocused);
        concentricCircleDatum.isDisplayed = concentricCircleDatum.pivot.isDisplayed;
      });
    
    setTimeout(() => {
      this.update(Operation.Lookup)
    })
  }

  /**
   * Adjusts the size of the boundary box around the visible circles of a concentric circles.
   * @param concentricCircleDatum Concentric cirlces to adjust boundary box of.
   */
  private resizeSelectBox(concentricCircleDatum: ConcentricCircle): void {

    const concentricCircle = this.getDatumElement(concentricCircleDatum.id) as Selection<SVGGElement, ConcentricCircle, HTMLElement, any>;
    
    const boundaryBox = concentricCircle.node().getBBox();
    const visibleRadius = this.calculateVisibleRadius(concentricCircleDatum);
    const posOffset = concentricCircleDatum.radius - visibleRadius;

    concentricCircle
      .select(`.${this.CLASS.SELECT_BOX}`)
      .attr('width', visibleRadius * 2)
      .attr('height', visibleRadius * 2)
      .attr('x', boundaryBox.x + posOffset)
      .attr('y', boundaryBox.y + posOffset);
  }

  /**
   * Zooms in on a specific concentric circles.
   * @param concentricCircle ID of concentric circles to zoom in on.
   */
  private zoomTo(concentricCircle): void {
    this.svg.transition()
    .duration(200)
    .call(
      this.zoom.transform,
      d3.zoomIdentity
        .translate(this.center.x + concentricCircle.x * 2, this.center.y + concentricCircle.y * 2)
        .scale(2)
        .translate(concentricCircle.x * -2, concentricCircle.y * -2)
    )
  }

  /** Recenter and reset canvas zoom to the default. */
  public resetZoom(): void {
    this.svg.transition()
      .duration(200)
      .call(
        this.zoom.transform,
        d3.zoomIdentity
          .translate(this.center.x, this.center.y)
          .scale(this.maxScale)
          .translate(-this.center.x, -this.center.y)
      );
  }

  /**
   * Computes the radius of a circle in px taking into account inner circles.
   * @param value Quantity used to determine radius.
   * @param offsetInPx Radius of the largest inner circle.
   * @returns Radius in px.
   */
  public calculateRadius(value: number, offsetInPx: number = 0): number {
    return this.radiusScale(value) + offsetInPx;
  }

  /**
   * Calculates the radius of the largest visible circle in a specific concentric circles.
   * @param concentricCircle Target concentric circle.
   * @returns Visible radius.
   */
  private calculateVisibleRadius(concentricCircle: ConcentricCircle): number {

    let visibleRadius = 0;

    for(const circle of [concentricCircle.pivot, ...concentricCircle.pivot.children]) {
      if (!circle.isDisplayed) {
        break;
      }
      visibleRadius = circle.radius;
    }

    return visibleRadius;
  }

  /**
   * Return the index of the latest comment up to a recent timestamp.
   * @param timestamp The comment with publish timestamp closest but under this timestamp is returned.
   * @returns Chronological zero-based index (progress).
   */
  private timestampToProgress(timestamp: number): number {
    if (!timestamp) {
      return -1;
    }

    const index = this.circlesByTimestamp.findIndex(circleDatum => circleDatum.rawCircleData.publishTimestamp > timestamp);
    return (index === -1 ? this.circlesByTimestamp.length : index) - 1;
  }

  /**
   * Determines if two concentric circles are direct replies to one another.
   * @param concentricCircle1 First concentric circle.
   * @param concentricCircle2 Decond concentric circle.
   * @returns `true` if they are direct replies, `false` otherwise.
   */
  private isImmediateRelativeOf(concentricCircle1: ConcentricCircle, concentricCircle2: ConcentricCircle): boolean {
    return concentricCircle1.parentConcentricCircleId === concentricCircle2.id || concentricCircle2.parentConcentricCircleId === concentricCircle1.id;
  }
  
  /**
   * Extracts the like counts of a circle or a concentric circle.
   * @param datum The entity to extract like counts from.
   * @returns The array of like counts.
   */
  public getLikeCounts(datum: ConcentricCircle | Circle): number[] {
    if (isConcentricCircleDatum(datum)) {
      const bucketCircles = this.getBucketCircles(datum);
      return _.flatMap(bucketCircles, circle => this.getLikeCounts(circle));
    } else {
      return [datum.rawCircleData.likeCount];
    }
  }

  /**
   * Accessor function to check if a circle is a pivot.
   * @param circle Circle to check.
   * @returns True if circles is a pivot. False otherwise.
   */
  public getIsPivot(circle: Circle): boolean {
    return circle.isPivot;
  }

  /**
   * Accessor function to check if a circle should be visible.
   * @param circle Circle to check.
   * @returns True if circles should be visible. False otherwise.
   */
  public shouldDisplayCircle(circle: Circle): boolean {
    return circle.isDisplayed && (!this.isHighlightModeOn || circle.isHighlighted );
  }

  /**
   * Accessor function to check the number of visible circles in a given group.
   * @param circles The group of circles to check. Can either be an array of circles or a concentric circle.
   * @returns The number of circles that should be visible.
   */
  public countDisplayedCircles(circles: Circle[] | ConcentricCircle): number {
    if (isConcentricCircleDatum(circles)) {
      return this.countDisplayedCircles([circles.pivot, ...circles.pivot.children]);
    } else {
      return circles.filter(circle => this.shouldDisplayCircle(circle)).length;
    }
  }

  /**
   * Accessor function to the constituent circles of a concentric circle.
   * @param concentricCircle The concentric circle whose circles to return.
   * @returns The array of circles that make up a concentric circle.
   */
  public getConcentricCircleCircles(concentricCircle: ConcentricCircle): Circle[] {
    return [concentricCircle.pivot, ...concentricCircle.pivot.children]
  }

  /**
   * Accessor function to the constituent circles of a bucket (concentric circles connected through their periphery).
   * @param concentricCircle A concentric circle of the bucket whose circles to return.
   * @returns The array of circles that make up a bucket.
   */
  public getBucketCircles(concentricCircle: ConcentricCircle): Circle[] {
    const rootConcentricCircle = this.getDatum(concentricCircle.rootConcentricCircleId) as ConcentricCircle;
    const concentricCircles = d3.hierarchy(rootConcentricCircle, concentricCircleDatum => concentricCircleDatum.peripherals)
      .descendants()
      .map(node => node.data);

    const circles = concentricCircles.reduce((circles, concentricCircle) => {
      circles.push(...this.getConcentricCircleCircles(concentricCircle));
      return circles;
    }, []) as Circle[];

    return circles;
  }

}

/** The operators that require an update operation to be performed after. */
enum Operation {
  Paint = 'paint',
  Balance = 'balance',
  Lookup = 'lookup',
  Retrieve = 'retrieve'
}

/** Represents all entities on the canvas. */
interface KandinskyGraph<T, K> {
  nodes: T[];
  links: K[];
}

/** Represents a single circle on the canvas. */
export interface Circle {
  id: string;
  index: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  radius: number;
  color: string;
  children: Circle[];
  innerParentId: string;
  concentricCircleId: string;
  isPivot: boolean;
  isDisplayed: boolean;
  isHighlighted: boolean;
  isFocused: boolean;
  rawCircleData: RawCircleData;
}

/** The necessary comment data for the canvas circle entity. */
export type RawCircleData = Omit<SocialComment, "content"|"commentCount"|"postId"|"parentAuthorName"|"comments" | "analytics">;

/** Represents a concentric circles on the canvas. */
export interface ConcentricCircle {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  radius: number;
  peripherals: ConcentricCircle[];
  rootConcentricCircleId: string;
  parentConcentricCircleId: string;
  isNucleus: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isDisplayed: boolean;
  pivot: Circle;
}

/** The possible canvas entity types. */
type datumTypes =  Circle | ConcentricCircle;

/** Represents a selection of canvas entities. */
type datumSelectionTypes = 
  Selection<SVGCircleElement, Circle, HTMLElement, any> |
  Selection<SVGGElement, ConcentricCircle, HTMLElement, any>;

/** Represents a connection between two concentric circles. */
interface ConcentricCircleDatumLink {
  target: string | ConcentricCircle;
  source: string | ConcentricCircle;
}
