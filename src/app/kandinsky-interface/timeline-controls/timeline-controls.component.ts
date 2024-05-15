import { Component, OnInit, Input, EventEmitter, Output } from '@angular/core';
import { MIN_PROGRESS, PLAY_LOOP_INTERVAL_MS, STEP } from 'src/app/config';

/**
 * Timeline bar component that allows exploration into the timeline of the comment discussion landscape.
 */
@Component({
  selector: 'ksky-timeline-controls',
  templateUrl: './timeline-controls.component.html',
  styleUrls: ['./timeline-controls.component.scss'],
})
export class TimelineControlsComponent implements OnInit {

  protected isPlaying: boolean = false;
  private playLoop: NodeJS.Timeout;

  protected readonly MIN_PROGRESS: number = MIN_PROGRESS;

  @Input()
  readonly MAX_PROGRESS: number;

  protected readonly STEP: number = STEP;

  private readonly PLAY_LOOP_INTERVAL_MS: number = PLAY_LOOP_INTERVAL_MS;

  @Input()
  progress: number;

  @Output() 
  progressChange: EventEmitter<number>

  constructor() {
    this.progressChange = new EventEmitter();
  }

  ngOnInit() {}

  /** Starts iterative canvas population by incrementing progress. */
  protected play(): void {
    this.isPlaying = true;
    this.playLoop = setInterval(() => {
      this.progress += this.STEP;
    }, this.PLAY_LOOP_INTERVAL_MS);
  }

  /** Pauses iterative canvas population. */
  public pause(): void {
    if (!this.isPlaying) {
      return;
    }

    if (this.playLoop) {
      clearInterval(this.playLoop);
    }
    this.isPlaying = false;
  }

  /** Propagates changes to progress to other components. */
  protected rangeChange(): void {
    this.progressChange.emit(this.progress);
    if (this.progress === this.MAX_PROGRESS) {
      this.pause();
    }
  }

  /** Sets progress to 0, or when all comments are hidden. */
  public reset(): void {
    this.progress = 0;
  }
}
