import { Pipe, PipeTransform } from '@angular/core';
import _ from 'lodash';

/**
 * Pipe to apply highlight formatting to texts.
 */
@Pipe({
  name: 'highlight'
})
export class HighlightPipe implements PipeTransform {

  constructor() {}

  /**
   * Applies the HTML formatting to the specific parts of the text, taking into account the priority of each highlighting option.
   * @param text Text to apply formatting in.
   * @param options Formatting to be applied to each part of the text.
   * @returns Resultant formatted text.
   */
  transform(text: string, options: HighlightOption[]): string {

    let transformedString = '';

    const intervals = _.chain(options)
      .map<HighlightInterval[]>((option, optionIndex) => option.indices.map(intervalIndices => ({
        color: option.color,
        textColor: option.textColor,
        i: _.clone(intervalIndices),
        priority: optionIndex
      })))
      .flatten()
      .orderBy([interval => interval.i[0], interval => interval.priority], ['asc', 'desc'])
      .value();

    // for each interval to format, checks if other intervals overlap and handle based on priority
    for (let i = 0; i < intervals.length; i++) {
      let interval = intervals[i];
      let nextIntervalIndex = i + 1;

      while (nextIntervalIndex < intervals.length) {
        let nextInterval = intervals[nextIntervalIndex];

        if (interval.priority === nextInterval.priority) {
          break;
        }

        if (this.overlaps(interval.i, nextInterval.i)) {
          const isCurrentOverNext = interval.priority > nextInterval.priority;
          const topInterval = isCurrentOverNext ? interval : nextInterval;
          const bottomInterval = isCurrentOverNext ? nextInterval : interval;
          const bottomIntervalIndex = isCurrentOverNext ? nextIntervalIndex : i;

          // ignore portion of lower priority interval that overlaps with higher priority interval
          if (topInterval.i[0] <= bottomInterval.i[0]) {
            if (topInterval.i[1] >= bottomInterval.i[1]) {
              intervals.splice(bottomIntervalIndex, 1);  
            } else {
              bottomInterval.i[0] = topInterval.i[1];
            }
          } else {
            // 
            if (topInterval.i[1] < bottomInterval.i[1]) {
              intervals.splice(bottomIntervalIndex + 2, 0, {
                ...bottomInterval,
                i: [topInterval.i[1], bottomInterval.i[1]]
              });
            }
            bottomInterval.i[1] = topInterval.i[0];
          }
        } else {
          break;
        }

        nextIntervalIndex++;
      }
    }

    let prevIntervalStop = 0;
    intervals.forEach(interval => {
      transformedString += text.slice(prevIntervalStop, interval.i[0]);
      transformedString += `<span style="background-color: ${interval.color}; color: ${interval.textColor};">${text.slice(interval.i[0], interval.i[1])}</span>`;
      prevIntervalStop = interval.i[1];
    });
    transformedString += text.slice(prevIntervalStop);

    return transformedString;
  }

  /**
   * Determines if two ranges of indices have any overlapping regions.
   * @param indicesA First range.
   * @param indicesB Second range.
   * @returns `true` if ranges overlap; `false` otherwise.
   */
  private overlaps(indicesA: [number, number], indicesB: [number, number]): boolean {
    return (indicesA[0] <= indicesB[0] && indicesA[1] > indicesB[0]) ||
      (indicesB[0] <= indicesA[0] && indicesB[1] > indicesA[0]);
  }

}

/**
 * Represents the regions in a text where a specific formatting is to be applied.
 */
export type HighlightOption = {
  /** Positions in the text where the requested formatting should be applied to. */
  indices: [number, number][];
  /** Highlight color. */
  color: string;
  /** Text font color. */
  textColor: string;
}

/**
 * Represents the formatting (and priority of formatting) to apply to each region in a text.
 */
export type HighlightInterval = {
  /** Region to format. */
  i: [number, number];
  /** Highlight color. */
  color: string;
  /** Text font color. */
  textColor: string;
  /** Priority of this formatting. */
  priority: number;
}
