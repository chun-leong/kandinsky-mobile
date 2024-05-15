import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CanvasComponent, ConcentricCircle, Circle } from './canvas/canvas.component';
import { SocialComment, SocialPlatform, SocialPost } from '../models/models';
import { ModalController, IonSearchbar, LoadingController, NavController } from '@ionic/angular';
import { TimelineControlsComponent } from './timeline-controls/timeline-controls.component';
import { PostInformationModalComponent } from './post-information-modal/post-information-modal.component';
import { KandinskyService, SearchResult, CommentGroupInterval } from '../services/kandinsky.service';
import _ from 'lodash';
import * as d3 from 'd3';
import { SpectrumRange, SpectrumInterval } from './spectrum-controls/spectrum-controls.component';
import { HighlightOption } from '../highlight.pipe';
import { ActivatedRoute } from '@angular/router';
import { MIN_PROGRESS, MIN_TIMESTAMP, SPECTRUM_DEFAULT_MODE, SEARCH_DEFAULT_MODE, SEARCH_DEFAULT_QUERY, SHOW_COMMENTS_DEFAULT, MAX_LIKE_BAR_WIDTH_PX, MIN_LIKE_BAR_WIDTH_PX, SHOW_SIMILARITY_DEFAULT, MINIMIZE_REFERENCE_COMMENT, NUM_GROUPS } from 'src/app/config';
import { buildLinearScale, createLoading, isConcentricCircleDatum, scrollToElement } from '../utils';

/**
 * The encompassing primary UI component responsible for displaying the social visualisation of a post and 
 * its comments. The component integrates all UI components.
 */
@Component({
  selector: 'ksky-kandinsky-interface',
  templateUrl: './kandinsky-interface.page.html',
  styleUrls: ['./kandinsky-interface.page.scss'],
})
export class KandinskyInterfacePage implements OnInit {

  // active post data
  protected post: SocialPost;

  // canvas params
  protected timestamp: number = MIN_TIMESTAMP;

  // timeline controls params
  protected progress: number = MIN_PROGRESS;
  protected maxProgress: number;

  // spectrum controls params
  protected isSpectrumModeOn: boolean = SPECTRUM_DEFAULT_MODE;
  protected spectrumIntervals: SpectrumInterval[];
  protected spectrumRange: SpectrumRange;
  protected spectrumStartTime: number;
  protected spectrumEndTime: number;
  private NUM_GROUPS: number = NUM_GROUPS;

  // search params
  protected isSearchFocusModeOn: boolean = SEARCH_DEFAULT_MODE;
  protected searchQuery: string = SEARCH_DEFAULT_QUERY;
  private searchResult: SearchResult;

  // detailed comment section params
  protected isShowCommentsOn: boolean = SHOW_COMMENTS_DEFAULT;
  protected selectedConcentricCircle: ConcentricCircle;
  protected visibleCommentsCount: number;
  private barWidthScale: d3.ScaleLinear<number, number>;
  private groupedCommentsByTimestamp: CommentGroupInterval[];
  private readonly MAX_LIKE_BAR_WIDTH: number = MAX_LIKE_BAR_WIDTH_PX;
  private readonly MIN_LIKE_BAR_WIDTH: number = MIN_LIKE_BAR_WIDTH_PX;

  // similar comments section params
  protected isShowSimilarCommentsOn: boolean = SHOW_SIMILARITY_DEFAULT;
  protected isReferenceCommentMinimized: boolean = MINIMIZE_REFERENCE_COMMENT;
  protected visibleSimilarCommentsCount: number;

  // comment item contexts (contains information to display)
  // used to avoid angular's change detection calling the buildcontext multiple times
  protected commentContext: CommentItemContext;
  protected commentRepliesContexts: CommentItemContext[];
  protected referenceCommentContext: CommentItemContext;
  protected similarCommentsContexts: CommentItemContext[];

  @ViewChild('timelineControls', { static: false })
  timelineControls: TimelineControlsComponent;

  @ViewChild('canvas', { static: true })
  canvas: CanvasComponent;

  @ViewChild('commentsList', { static: false, read: ElementRef })
  commentsList: ElementRef;

  @ViewChild('searchbar', { static: false })
  searchbar: IonSearchbar;
  
  postInformationModal: HTMLIonModalElement;

  constructor(
    private kandinskyService: KandinskyService,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private route: ActivatedRoute,
    private navController: NavController
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.initialize(params.id, params.platform);
    });
  }

  /**
   * Implements the retrieve operator in the abstraction model.
   * @param groupOfCircles A `ConcentricCircle` to return comment data in that thread, or an array of `Circles` to return comment data represented by those circles only.
   */
  private retrieve(groupOfCircles: ConcentricCircle | Circle[]): void {
    if (isConcentricCircleDatum(groupOfCircles)) {
      const circles = this.canvas.getConcentricCircleCircles(groupOfCircles);

      this.commentContext = this.buildCommentItemContext(circles[0]);
      this.commentRepliesContexts = circles.slice(1).map(c => this.buildCommentItemContext(c));
    } else {
      this.referenceCommentContext = this.buildCommentItemContext(groupOfCircles[0], {
        showRepliesButton: false,
        showSimilaritiesButton: false,
        showLines: false,
        forceVisibility: true
      });
      this.similarCommentsContexts = groupOfCircles.slice(1).map(circle => this.buildCommentItemContext(circle, {
        showRepliesButton: false,
        showSimilaritiesButton: false,
        showSimilarityScore: true,
      }));
    }
  }

  /**
   * Initialise the Kandinsky interface page for the active post.
   * @param postId The ID of the active post.
   * @param platform The platform that the post belongs to.
   */
  private async initialize(postId: string, platform: SocialPlatform): Promise<void> {
    
    this.barWidthScale = d3.scaleLinear().range([this.MIN_LIKE_BAR_WIDTH, this.MAX_LIKE_BAR_WIDTH]);

    const loading = await createLoading(this.loadingController);
    
    loading.present();

    console.log('Setting active post...')
    await this.kandinskyService.setActivePost(postId, platform, loading);

    console.time('Preparing data for canvas');
    loading.message = 'Preparing canvas...';
    
    await this.initialiseComponents();
    
    console.timeEnd('Preparing data for canvas');
  }

  /** Initialise the variables and child components of the Kandinsky interface page. */
  private async initialiseComponents(): Promise<void> {
    console.time("Canvas preparation time");
    this.post = this.kandinskyService.getActivePost();
    
    this.maxProgress = this.post.commentCount - 1;

    await this.createPostInformationModal();

    console.log('Grouping comments by timestamp...')
    this.groupedCommentsByTimestamp = this.kandinskyService.groupCommentsByTimestamp(this.NUM_GROUPS);

    this.spectrumIntervals = this.groupedCommentsByTimestamp.map((group) => ({
      heightValue: group.comments.length
    }));

    this.canvas.constructCanvas(this.kandinskyService.getActivePostComments());
  }

  /** Handler when canvas component is ready. */
  protected onCanvasReady(): void {
    this.loadingController.dismiss()
  }

  /** Display information about active post. */
  protected async displayPostInformation(): Promise<void> {
    await this.postInformationModal.present();
    this.postInformationModal.onDidDismiss().then(async () => await this.createPostInformationModal())
  }

  /** Creates the active post information sheet. This function does not display the information sheet, see `displayPostInformation()` instead. */
  private async createPostInformationModal(): Promise<void> {
    this.postInformationModal = await this.modalController.create({
      component: PostInformationModalComponent,
      componentProps: {
        post: this.post,
        reloadDataHandler: this.reloadDataHandler.bind(this),
        deletePostHandler: this.deletePostHandler.bind(this),
        dismissPostInformation: this.dismissPostInformation.bind(this)
      },
      cssClass: 'auto-sized-modal'
    });
  }

  /** Fetches updated data of the active post from the platform's server. */
  private async reloadDataHandler(): Promise<void> {
    const loading = await createLoading(this.loadingController);
    loading.present();
    await this.kandinskyService.reloadActivePost(loading);
    await this.initialiseComponents();
    this.timelineControls.reset();
  }
  
  /** Removes the active post data from storage. */
  private async deletePostHandler(): Promise<void> {
    const loading = await createLoading(this.loadingController);
    await loading.present();
    await this.kandinskyService.deletePost(this.post.id, this.post.platform, loading);
    await loading.dismiss();
    this.returnToMainMenu();
  }
  
  /** Closes the post information sheet. */
  protected async dismissPostInformation(): Promise<void> {
    this.postInformationModal.dismiss();
  }
  
  /**
   * Selects a specific comment thread and displays a specific comment within that thread.
   * 
   * @remarks
   * Called when 'View replies' or 'View as reply to ...' button is clicked in a comment.
   * 
   * @param pivotId ID of pivot circle of the concentric circle to select. If no value is provided, unselects all comment threads.
   * @param targetCircleId ID of comment in the comment thread to display.
   */
  protected selectConcentricCircle(pivotId?: string, targetCircleId?: string): void {
    this.canvas.selectByPivotId(pivotId);
    if (pivotId && targetCircleId) scrollToElement(`comment-${targetCircleId}`);
  }

  /**
   * Handler for selecting a comment thread.
   * 
   * @remarks
   * Called when the selected circle for the canvas component is changed.
   * 
   * @param concentricCircleDatum `ConcentricCircleDatum` of the comment thread to selected. If no value is provided, it is taken that no comment threads are selected.
   */
  protected selectedConcentricCircleChange(concentricCircleDatum: ConcentricCircle = null): void {
    console.log("Select circle")
    if (this.isShowSimilarCommentsOn) {
      this.selectedSimilarityReferenceCircleChange();
    }

    if(this.timelineControls) {
      this.timelineControls.pause();
    }

    if (this.selectedConcentricCircle === concentricCircleDatum) {
      return;
    }

    this.updateDetailedCommentSectionProps(concentricCircleDatum);

    // scroll up if there are comments for this circle
    if (this.commentsList) {
      this.commentsList.nativeElement.scrollTop = 0;
    }
  }

  /**
   * Handler for selecting a reference comment.
   * 
   * @remarks
   * Called when viewing similar comments for a reference comment.
   * 
   * @param circleDatum `CircleDatum` of the comment selected as the reference comment. If no value is provided, it is taken that similar comments are not being accessed.
   */
  protected selectedSimilarityReferenceCircleChange(circleDatum: Circle = null): void {

    // clear search bar if similarity reference circle is selected
    if (circleDatum) {
      this.searchQuery = '';
    }

    this.updateSimilarityCommentsProps(circleDatum);
  }

  /**
   * Handler for changes made to timeline slider.
   * 
   * @remarks
   * Called by timeline controls on change.
   * 
   * @param progress Chronological zero-based index of comment.
   */
  protected timestampChange(progress: number): void {

    // timeout because of race condition when propagating timestamp to canvas
    setTimeout(() => {

      this.updateCommentContexts();

      if (this.selectedConcentricCircle && !this.selectedConcentricCircle.isDisplayed) {
        // if selected circle disappears, unselect it
        this.canvas.selectByPivotId(null);
      }
    });

    this.timestamp = progress !== -1 ? this.kandinskyService.getCommentTimestamp(progress) : 0;
  }

  /**
   * Performs a query search on all comments.
   * @param query Query string to search for.
   */
  protected search(query: string = ""): void {
    console.time('keyword search');

    this.isSearchFocusModeOn = query.length > 0;
    this.searchResult = this.kandinskyService.searchComments(query);

    this.canvas.setFocused(Object.keys(this.searchResult));

    // update the highlightOptions of visible comments
    const commentContextsToUpdate: CommentItemContext[] = [];

    if (this.isShowCommentsOn) {
      commentContextsToUpdate.push(this.commentContext, ...this.commentRepliesContexts);
    }

    if (this.isShowSimilarCommentsOn) {
      commentContextsToUpdate.push(this.referenceCommentContext, ...this.similarCommentsContexts);
    }

    commentContextsToUpdate
      .filter(c => c.context.display.visible)
      .forEach(c => {

        const match = this.searchResult[c.context.comment.id];

        // must replace list of highlightOptions to trigger change detection and call highlight pipe
        c.context.display.highlightOptions = [
          c.context.display.highlightOptions[0],
          {
            ...c.context.display.highlightOptions[1],
            indices: match || []
          }
        ];
      });
    
    console.timeEnd('keyword search');
  }

  /**
   * Sets the search focus mode.
   * @param focused `true` to set search focus mode on; `false` to set it off.
   */
  protected setIsSearchFocusOn(focused: boolean): void {
    this.isSearchFocusModeOn = focused;

    if (focused && this.timelineControls) {
      this.timelineControls.pause();
    }
  }

  /** Toggles between timeline spectrum mode. All comments are displayed when spectrum mode is active. */
  protected toggleSpectrumMode(): void {
    this.isSpectrumModeOn = !this.isSpectrumModeOn;
    this.canvas.resetZoom();

    if (this.isSpectrumModeOn) {
      // Display all comments
      this.timestampChange(this.maxProgress);
    } else {
      this.canvas.setHighlighted([]);
    }
  }

  /** Handler for changes made to range of spectrum timelines. */
  protected spectrumRangeChange(): void {
    const lowerGroupIndex = this.spectrumRange.lower === -1 ? 0 : this.spectrumRange.lower;
    const upperGroupIndex = this.spectrumRange.upper === -1 ? 0 : this.spectrumRange.upper;

    this.spectrumStartTime = this.groupedCommentsByTimestamp[lowerGroupIndex].startTimestamp;
    this.spectrumEndTime = this.groupedCommentsByTimestamp[upperGroupIndex].endTimestamp;

    let commentIds: string[] = [];
    for (let groupIndex = lowerGroupIndex; groupIndex <= upperGroupIndex; groupIndex++) {
      commentIds.push(...this.groupedCommentsByTimestamp[groupIndex].comments.map(socialComment => socialComment.id));
    }

    this.canvas.setHighlighted(commentIds);

    // timeout because of race condition when propagating highlight changes to canvas
    setTimeout(() => this.updateCommentContexts());
  }

  /**
   * Constructs UI context data for a comment.
   * @param circleDatum Comment to construct UI context data for.
   * @param showRepliesButton Indicates whether to display the "View Replies" button.
   * @param showSimilaritiesButton Indicates whether to display the "View similar comments" button.
   * @param showLines Indicates whether to use a bottom border for the comment item.
   * @param forceVisibility Indicates if comment's visibility is independent of the timeline slider.
   * @param showSimilarityScore Indicates whether to display the similarity score of the comment when compared with a reference comment.
   * @param similarityScore Sets the value of the similarity score.
   */
  private buildCommentItemContext(circleDatum: Circle, {
    showRepliesButton = true,
    showSimilaritiesButton = true,
    showLines = true,
    forceVisibility = false,
    showSimilarityScore = false,
    similarityScore = 0
  } = {}): CommentItemContext {

    // const comment: SocialComment = this.canvas.getComment(circleDatum);
    const comment: SocialComment = this.kandinskyService.getComment(circleDatum.index);
    const searchResult = this.searchResult ? this.searchResult[comment.id] : null;
    const totalReplyCount = comment.commentCount > 0 ? this.canvas.countDisplayedCircles(circleDatum.children) : 0;
    const similarCommentsCount = Object.keys(this.kandinskyService.getSimilarCommentScores(comment)).length;

    // extract indices to highlight topic terms
    const topicIndices = [].concat.apply([], [...Object.values(comment.analytics.topics)].map(topicInfo => topicInfo.indices));    
    const barParams = this.canvas.paintCommentBar(circleDatum, this.barWidthScale, this.isShowSimilarCommentsOn);
    
    return {
      context: {
        id: `comment-${comment.id}`,
        comment: comment,
        display: {
          visible: forceVisibility || this.canvas.shouldDisplayCircle(circleDatum),
          showLines: showLines,
          highlightOptions: [
            {
              indices: topicIndices,
              color: 'yellow',
              textColor: 'black'
            }, {
              indices: searchResult || [],
              color: 'blue',
              textColor: 'white'
            }
          ]
        },
        bar: {
          ...barParams,
          width: `${barParams.width}px`
        },
        circle: circleDatum,
        replies: {
          count: totalReplyCount,
          showViewAsReplyToParentButton: showRepliesButton && this.canvas.getIsPivot(circleDatum) && comment.parentCommentId !== null,
          showViewRepliesButton: showRepliesButton && !this.canvas.getIsPivot(circleDatum) && totalReplyCount > 0
        },
        analytics: {
          similarity: {
            similarCommentsCount,
            score: similarityScore,
            showScore: showSimilarityScore,
            showButton: showSimilaritiesButton && similarCommentsCount > 0,
          }
        }
      }
    };
  }

  /** Updates the comments information when changes are made to their visibility. */
  private updateCommentContexts(): void {
    const commentContextsToUpdate: CommentItemContext[] = [];
    let prevVisibileCommentsCount = 0;
    let newVisibleCommentsCount = 0;

    if (this.isShowCommentsOn) {
      prevVisibileCommentsCount = this.visibleCommentsCount;
      commentContextsToUpdate.push(this.commentContext, ...this.commentRepliesContexts);
      this.visibleCommentsCount = this.canvas.countDisplayedCircles([this.selectedConcentricCircle.pivot, ...this.selectedConcentricCircle.pivot.children]);
      newVisibleCommentsCount = this.visibleCommentsCount;
    }
    
    if (this.isShowSimilarCommentsOn) {
      prevVisibileCommentsCount = this.visibleSimilarCommentsCount;
      commentContextsToUpdate.push(this.referenceCommentContext, ...this.similarCommentsContexts);
      this.visibleSimilarCommentsCount = this.canvas.countDisplayedCircles(this.similarCommentsContexts.map(c => c.context.circle));
      newVisibleCommentsCount = this.visibleSimilarCommentsCount;
    }

    commentContextsToUpdate.forEach(commentItemContext => 
      commentItemContext.context.display.visible = this.canvas.shouldDisplayCircle(commentItemContext.context.circle)
    );

    if (newVisibleCommentsCount > 0 && prevVisibileCommentsCount != newVisibleCommentsCount) {
      const lastVisibleCommentContext = commentContextsToUpdate.filter(c => c.context.display.visible).pop();
      scrollToElement(lastVisibleCommentContext.context.id);
    }
  }

  /**
   * Updates the detailed comment information when a comment thread is selected.
   * @param concentricCircleDatum `ConcentricCircleDatum` of the comment thread to selected. If no value is provided, it is taken that no comment threads are selected.
   */
  protected updateDetailedCommentSectionProps(concentricCircleDatum?: ConcentricCircle): void {
    this.selectedConcentricCircle = concentricCircleDatum;
    this.isShowCommentsOn = concentricCircleDatum ? true : false;
    this.visibleCommentsCount = concentricCircleDatum ? this.canvas.countDisplayedCircles(concentricCircleDatum) : 0;
    
    if (!concentricCircleDatum) {
      this.commentContext = null;
      this.commentRepliesContexts = [];
    } else {
      this.retrieve(concentricCircleDatum);
    }
  }

  /**
   * Updates the similar comments information when a reference comment is selected.
   * @param referenceCircleDatum `CircleDatum` of the comment selected as the reference comment. If no value is provided, it is taken that similar comments are not being accessed.
   */
  private updateSimilarityCommentsProps(referenceCircleDatum?: Circle): void {
    if (!referenceCircleDatum) {
      this.isShowSimilarCommentsOn = false;
      this.visibleSimilarCommentsCount = 0;
      this.canvas.setFocused([]);
      return;
    }
    const referenceComment: SocialComment = this.kandinskyService.getComment(referenceCircleDatum.index);

    const similarCommentScores = this.kandinskyService.getSimilarCommentScores(referenceComment);
    const similarCommentIds = Object.keys(similarCommentScores);
    const similarCommentCircles = this.canvas.getCircleData(similarCommentIds);

    // rebuild bar witdh scale with values from comment and similar comments
    this.barWidthScale = this.buildLikeCountBarWidthScale(referenceCircleDatum, ...similarCommentCircles);
    
    // highlight similar circles
    this.canvas.setFocused(similarCommentIds);

    this.isShowSimilarCommentsOn = true;

    this.retrieve([referenceCircleDatum, ...similarCommentCircles]);

    this.similarCommentsContexts.forEach(context => context.context.analytics.similarity.score = similarCommentScores[context.context.comment.id])

    this.visibleSimilarCommentsCount = this.canvas.countDisplayedCircles(similarCommentCircles);
  }

  /**
   * Creates a scale for the number of likes on a comment and its replies (if any).
   * @param circles The collection of `ConcentricCircleDatum` or `CircleDatum` objects to build the like count for.
   * @returns `ScaleLinear` object.
   */
  private buildLikeCountBarWidthScale(...circles: ConcentricCircle[] | Circle[]): d3.ScaleLinear<number, number> {
    let likeCounts = [];
    for (const circle of circles) {
      likeCounts = [...likeCounts, ...this.canvas.getLikeCounts(circle)]
    }
    const likeCountDomain = d3.extent(likeCounts);
    return buildLinearScale(likeCountDomain[0], likeCountDomain[1], this.MIN_LIKE_BAR_WIDTH, this.MAX_LIKE_BAR_WIDTH)
  }

  /** Return to the post menu page. */
  private returnToMainMenu(): void {
    this.navController.navigateBack(['']);
  }
  
}

/** Represents UI data for a comment. */
type CommentItemContext = {
  context: {
    id: string;
    comment: SocialComment;
    display: {
      visible: boolean;
      showLines: boolean;
      highlightOptions: HighlightOption[];
    },
    bar: {
      color: string;
      width: string;
    },
    circle: Circle,
    replies: {
      count: number;
      showViewAsReplyToParentButton: boolean;
      showViewRepliesButton: boolean;
    },
    analytics: {
      similarity: {
        showButton: boolean;
        similarCommentsCount: number;
        showScore: boolean;
        score: number;
      }
    }
  }
}
