import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { Selection, ScaleBand, ScaleLogarithmic } from 'd3';
import * as d3 from 'd3';
import _ from 'lodash';
import { ACTIVE_BAR_COLOR, MIN_SPECTRUM, PASSIVE_BAR_COLOR } from 'src/app/config';

/**
 * Spectrum component that displays the comment in bins and allows users to select a range of comments to explore.
 */
@Component({
  selector: 'ksky-spectrum-controls',
  templateUrl: './spectrum-controls.component.html',
  styleUrls: ['./spectrum-controls.component.scss'],
})
export class SpectrumControlsComponent implements OnInit, OnChanges {

  protected readonly MIN_RANGE_VALUE = MIN_SPECTRUM;
  
  @Input()
  intervals: SpectrumInterval[];

  @Input()
  range: SpectrumRange;

  @Output()
  rangeChange: EventEmitter<SpectrumRange>;

  private componentContainer: Selection<SVGGElement, any, HTMLElement, any>;

  private yScale: ScaleLogarithmic<number, number>;
  private xScale: ScaleBand<string>;

  private readonly ACTIVE_BAR_COLOR = ACTIVE_BAR_COLOR;
  private readonly PASSIVE_BAR_COLOR = PASSIVE_BAR_COLOR;

  constructor() {
    this.rangeChange = new EventEmitter();
  }

  ngOnInit() {
    // Use preset range if the local range value is not set
    if (!this.range) {
      this.range = {
        lower: Math.floor(this.intervals.length * 0.25),
        upper: Math.floor(this.intervals.length * 0.75)
      };
    }

    setTimeout(() => {
      this.prepareLayout();
    });

    if (this.intervals && this.intervals.length > 0) {
      setTimeout(() => {
        this.updateBars(this.intervals);
        this.repaintBars();
      });
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // if the bin data changes
    if (changes.intervals && !changes.intervals.isFirstChange()) {
      setTimeout(() => {
        this.updateBars(this.intervals);
      });
    }
  }

  /** Propagates changes to the spectrum range to other components. */
  protected dualRangeChange(): void {
    this.rangeChange.emit(this.range);
    this.repaintBars();
  }

  /** Applies the active/passive colours to the bars depending on their inclusion in the spectrum range. */
  private repaintBars(): void {
    this.componentContainer
    .selectAll<any, SpectrumInterval>(".bar")
      .style("fill", (d, i) => (i >= this.range.lower && i <= this.range.upper) ? this.ACTIVE_BAR_COLOR : this.PASSIVE_BAR_COLOR);
    
    this.componentContainer
      .select(".select-overlay")
      .attr("x", d => this.xScale(this.range.lower + ''))
      .attr("width", (this.xScale.step()) * (this.range.upper - this.range.lower + 1));
  }

  /**
   * Update the bars using the bin data.
   * @param intervalData Information about the number of comments in each bin in sequential order.
   */
  private updateBars(intervalData: SpectrumInterval[]): void {

    const values = intervalData.map(b => b.heightValue);

    this.yScale = d3.scaleLog()
      .clamp(true)
      .domain([0.1, Math.max(...values)])
      .range([Number(this.componentContainer.attr('height')), 0])
      .nice();
   
    this.xScale = d3.scaleBand()
      .domain(_.range(0, intervalData.length).map(i => i + ''))
      .range([0, Number(this.componentContainer.attr('width'))])
      .padding(0.1);

    this.componentContainer
      .selectAll(".bar")
      .data(intervalData)
      .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", (d, i) => this.xScale(i + ''))
        .attr("width", this.xScale.bandwidth())
        .attr("y", d => this.yScale(d.heightValue))
        .attr("height", d => Number(this.componentContainer.attr('height')) - this.yScale(d.heightValue));
    
    this.componentContainer
      .append("rect")
      .attr("class", "select-overlay")
      .attr("fill", "black")
      .style("opacity", 0.25)
      .attr("y", 0)
      .attr("height", d => Number(this.componentContainer.attr('height')))
  }

  /** Assign references to the elements in the component for ease of access in the class functions. */
  private prepareLayout(): void {
    const spectrumSvg = d3.select<SVGElement, unknown>('svg.spectrum-canvas');
    
    if (this.componentContainer) {
      this.componentContainer.remove();
    }

    this.componentContainer = spectrumSvg
      .append('g')
      .attr('width', spectrumSvg.property('clientWidth'))
      .attr('height', spectrumSvg.property('clientHeight'));
  }
}

/** Represents the currently selected range. */
export type SpectrumRange = {
  upper: number;
  lower: number;
}


/** Represents the value used to derive the bar's height. */
export type SpectrumInterval = {
  heightValue: number;
}