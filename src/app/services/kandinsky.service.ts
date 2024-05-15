import { Injectable } from '@angular/core';
import { SocialPlatform, SocialPost, SocialComment } from '../models/models';
import { getIndices } from '../utils';
import * as d3 from 'd3';
import _ from 'lodash';
import { SEARCH_QUERY_MIN_LENGTH } from '../config';
import { SocialServiceFactory } from './social/social-factory.service';
import { AnalyticsService } from './analytics.service';

/**
 * Central component that integrates the UI components with the back-end services.
 */
@Injectable({
  providedIn: 'root'
})
export class KandinskyService {

  // Currently selected post data
  private post: SocialPost;
  private commentsByTimestamp: SocialComment[];

  // The minimum length of the query before search is performed
  private SEARCH_QUERY_MIN_LENGTH = SEARCH_QUERY_MIN_LENGTH;

  constructor(
    private socialServiceFactory: SocialServiceFactory,
    private analyticsService: AnalyticsService
  ) {}

  /**
   * Implements the lookup operator in the abstraction model.
   * @param input The string of keywords or comment to be used as a predicate.
   * @param comment The reference comment to compare the predicate against.
   * @returns True if the predicate is fulfilled. False otherwise.
   */
  public lookup(input: string | SocialComment, comment: SocialComment): boolean {
    if (_.isString(input)) {
      const keywordsRegex = new RegExp(input.trim().replace(/ /g, '|'), 'gi');
      return comment.content.match(keywordsRegex) ? true : false;;
    } else {
      return this.analyticsService.calculateTopicSimilarity(comment, input) > this.analyticsService.SIMILARITY_THRESHOLD;
    }
  }

  /**
   * Retrieves saved posts from the browser storage.
   * @returns A promise that resolves with the list of saved posts.
   */
  public async getPosts(): Promise<SocialPost[]> {
    return await this.socialServiceFactory.getPostsFromStorage();
  }

  /**
   * Gets the currently selected post.
   * @returns The currently selected post.
   */
  public getActivePost(): SocialPost {
    return this.post;
  }

  /**
   * Gets the comments of the currently selected post.
   * @returns An array of the comments of the currently selected post.
   */
  public getActivePostComments(): SocialComment[] {
    return this.commentsByTimestamp;
  }

  /**
   * Gets the publish timestamp of a specific comment.
   * @param index Chronological zero-based index of the comment.
   * @returns The publish timestamp of the comment.
   */
  public getCommentTimestamp(index: number): number {
    return this.commentsByTimestamp[index].publishTimestamp;
  }

  /**
   * Gets the comment data of a specific comment.
   * @param index Chronological zero-based index of the comment.
   * @returns The comment data represented in a `SocialComment` object.
   */
  public getComment(index: number): SocialComment {
    return this.commentsByTimestamp[index];
  }

  /**
   * Sets a post as the currently selected post and fetches related comments.
   * @param postId The ID of the post to set as active.
   * @param platform The platform of the post.
   * @param status An optional loading element to display loading status.
   */
  public async setActivePost(postId: string, platform: SocialPlatform, status?: {message?: string}): Promise<void> {
    console.time('Preparing data time');

    if (status) status.message = 'Fetching post data...';
    this.post = await this.socialServiceFactory.getPost(postId, platform);
    const areCommentsInStorage = this.post.metadata.commentsMetadata.lastUpdateTimestamp !== null;
    const areCommentsAnalyzed = this.post.metadata.commentsMetadata.lastAnalysisTimestamp !== null;

    if (status) status.message = 'Fetching post comments...';
    this.commentsByTimestamp = (await this.socialServiceFactory.getComments(postId, platform, areCommentsAnalyzed))
    .sort((a, b) => a.publishTimestamp - b.publishTimestamp); // delay saving comments if analysis is to be performed later
    console.log(`${this.commentsByTimestamp.length} comments fetched`);
 
    if (status) status.message = 'Running topic modeling...';
    if (!areCommentsAnalyzed) {      
      console.time("Analytics preprocessing time")
      this.commentsByTimestamp.forEach(comment => 
        comment.analytics.topics = this.analyticsService.identifyTopics(comment.content)
      );
      console.timeEnd("Analytics preprocessing time")
      this.post = await this.socialServiceFactory.updatePostData(postId, platform, {updatedComments: this.commentsByTimestamp, areCommentsAnalyzed: true});
    }
    
    if (areCommentsAnalyzed && !areCommentsInStorage) {
      // fetch updated post information (from storage) if it was not already fetched
      this.post = await this.socialServiceFactory.getPost(postId, platform);
    }
  
    console.timeEnd('Preparing data time');
  }

  /**
   * Removes a post from storage.
   * @param postId The ID of the post to delete.
   * @param platform The platform of the post.
   */
  public async deletePost(postId: string, platform: SocialPlatform, status?:  {message?: string}): Promise<void> {
    if (status) status.message = 'Deleting post data and comments...';
    await this.socialServiceFactory.deletePost(postId, platform);
  }

  /**
   * Fetches updated data of the active post from the platform's server.
   */
  public async reloadActivePost(status?: {message?: string}): Promise<void> {
    const postId = this.post.id;
    const platform = this.post.platform;

    await this.deletePost(postId, platform, status);
    await this.setActivePost(postId, platform, status);
  }
  
  /**
   * Searches for comments of the active post that contain a specific string of characters.
   * @param query String of characters to search for. Length has to be more than the `SEARCH_QUERY_MIN_LENGTH`.
   * @returns Array of IDs of comments containing the query and the query's position within those comments.
   */
  public searchComments(query: string): SearchResult {

    // this.searchResults = this.commentsFuse.search<string, true, true>(query)
    //   .filter(r => r.matches.length > 0)
    //   .filter(r => r.score > 0.5);

    if (query.length < this.SEARCH_QUERY_MIN_LENGTH) {
      return {};
    }

    query = _.escapeRegExp(query);

    return this.commentsByTimestamp.reduce((results, comment) => {
      if (!this.lookup(query, comment)) {
        return results;
      }

      const keywordsRegex = new RegExp(query.trim().replace(/ /g, '|'), 'gi');

      const indices = getIndices(keywordsRegex, comment.content);

      results = {
        ...results,
        [comment.id]: indices
      }

      return results;
    }, {} as SearchResult);
  }

  /**
   * Calculates the similarity scores for comments similar to the input comment predicate.
   * @param input The comment used as the predicate.
   * @returns The similarity score of each comment that fulfils the predicate.
   */
  public getSimilarCommentScores(input: SocialComment): {[commentId: string]: number} {
    const similarComments = this.commentsByTimestamp.filter(comment => this.lookup(input, comment) && input.id !== comment.id);
    return similarComments.reduce((similarCommentScores, similarComment) => 
    (similarCommentScores[similarComment.id]=this.analyticsService.calculateTopicSimilarity(input, similarComment), similarCommentScores), {});
  }

  /**
   * Groups comments according to their publish timestamp.
   * @param groups Number of groups to split comments into.
   * @returns Array containing each group's information and the comments belonging to each group.
   */
  public groupCommentsByTimestamp(groups: number): CommentGroupInterval[] {

    const utcScale = d3.scaleUtc()
      .domain([this.post.publishTimestamp, this.post.metadata.commentsMetadata.lastTimestamp])
      .range([0, groups - 1]);
      
    const commentsByDate: CommentGroupInterval[] = _.range(0, groups).map(i => ({
      startTimestamp: utcScale.invert(i).getTime(),
      endTimestamp: utcScale.invert(i + 1).getTime(),
      comments: []
    }));

    let groupIndex = 0;
    this.commentsByTimestamp.forEach(comment => {
      let group = commentsByDate[groupIndex];
      while (comment.publishTimestamp >= group.endTimestamp) {
        group = commentsByDate[++groupIndex];
      }

      group.comments.push(comment);
    });

    return commentsByDate;
  }

  /**
   * Extracts the post ID from the post's URL.
   * @param postUrl URL to post.
   * @returns Post ID or `undefined` if the URL is not supported by the app.
   */
  public extractPostId(postUrl: string): string | undefined {
    return this.socialServiceFactory.extractPostId(postUrl);
  }

  /**
   * Extracts the platform that a post originates from from the post's URL.
   * @param postUrl URL to post.
   * @returns `SocialPlatform` of the post or `undefined` if the URL is not supported by the app.
   */
  public extractPlatform(postUrl: string): SocialPlatform | undefined {
    return this.socialServiceFactory.extractPlatform(postUrl);
  }

}

/** Represents a search result. */
export type SearchResult = {
  /** The ID of the comment containing the search string. */
  [commentId: string]: [number, number][];
}

/** Group of comments according to their publish timestamps. */
export type CommentGroupInterval = {
  /** Comments in this group were published after this timestamp. */
  startTimestamp: number,
  /** Comments in this group were published before this timestamp. */
  endTimestamp: number,
  /** Comments belonging to this group. */
  comments: SocialComment[]
}