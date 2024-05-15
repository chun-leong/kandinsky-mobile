import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SocialPlatform, RawSocialComment, RawSocialPost } from 'src/app/models/models';
import { StorageServiceFactory } from '../storage-factory.service';
import { map, concatMap, startWith, merge, toArray, mergeMap } from 'rxjs/operators';
import { Observable, of, from } from 'rxjs';
import { SocialService } from './social.service';
import _ from 'lodash';
import { YOUTUBE_API_KEY, YOUTUBE_API_URL_COMMENTS, YOUTUBE_API_URL_REPLIES, YOUTUBE_API_URL_VIDEOS, YOUTUBE_COMMENTS_STORE_NAME, YOUTUBE_POSTS_STORE_NAME } from 'src/app/config';

/**
 * YouTube service module implementation to handle post, comment, and comment replies data retrieval.
 */
@Injectable({
  providedIn: 'root'
})
export class YoutubeService extends SocialService {

  private readonly API_KEY = YOUTUBE_API_KEY;

  /** URL to {@link https://developers.google.com/youtube/v3/docs/videos/list#http-request YouTube's video API} */
  private readonly API_URL_VIDEOS = YOUTUBE_API_URL_VIDEOS;

  /** URL to {@link https://developers.google.com/youtube/v3/docs/commentThreads/list#http-request YouTube's comment thread API} */
  private readonly API_URL_COMMENTS = YOUTUBE_API_URL_COMMENTS;

  /** URL to {@link https://developers.google.com/youtube/v3/docs/comments/list#http-request YouTube's comment API} */
  private readonly API_URL_REPLIES = YOUTUBE_API_URL_REPLIES;

  private static STORE_NAME_POST = YOUTUBE_POSTS_STORE_NAME;
  private static STORE_NAME_COMMENTS = YOUTUBE_COMMENTS_STORE_NAME;

  private urlRegExp: RegExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;

  constructor(
    private http: HttpClient,
    storageServiceFactory: StorageServiceFactory,
  ) {
    super(
      storageServiceFactory.getStorageService(YoutubeService.STORE_NAME_POST),
      storageServiceFactory.getStorageService(YoutubeService.STORE_NAME_COMMENTS)
    );
  }

  /**
   * Fetches video post data from the platform's server.
   * @param videoId The ID of the post to fetch.
   * @returns An `Observable` that returns the post as a `RawSocialPost` object.
   */
  protected fetchPost(videoId: string): Observable<RawSocialPost> {
    const params = this.buildPostRequestParams(videoId);
    return this.http.get(this.API_URL_VIDEOS, { params }).pipe(
      map((response: any) => this.platformPostDataToRawSocialPost(response.items[0]))
    );
  }

  /**
   * Fetches comment data of a post from the platform's server.
   * @param videoId The ID of the post to fetch the comment data from.
   * @returns An `Observable` that returns the comment data as `RawSocialComment` objects.
   */
  protected fetchComments(videoId: string): Observable<RawSocialComment> {
    const params = this.buildCommentsRequestParams(videoId);
    return this.fetchAllComments(videoId, params).pipe(
      mergeMap(commentThreadData => {
        return of(...this.platformCommentDataToRawSocialComment(commentThreadData))
      })
    );
  }

  /**
   * Recurring method to fetch all comments of a post.
   * @param videoId The ID of the post to fetch the comment data from.
   * @param params Request parameters for {@link https://developers.google.com/youtube/v3/docs/commentThreads/list#http-request YouTube's comment thread API}.
   * @returns An `Observable` that returns the comments as an object in {@link https://developers.google.com/youtube/v3/docs/commentThreads#resource YouTube's format}.
   */
  private fetchAllComments(videoId: string, params: {[param: string]: string | string[]}): Observable<any> {
    return this.http.get(this.API_URL_COMMENTS, { params }).pipe(
      concatMap((response: any) => {
        const commentThreads = from(response.items as any[]).pipe(
          concatMap(commentThread => {
            if (commentThread.snippet.totalReplyCount === 0) {
              return of({
                ...commentThread,
                replies: []
              });
            }

            // commentThread.replies sometimes contain all replies to the top-level comment and no extra API calls necessary to fetch those replies
            if (commentThread.snippet.totalReplyCount === commentThread.replies.comments.length) {
              return of({
                ...commentThread,
                replies: commentThread.replies.comments || []
              });
            }

            return this.fetchReplies(commentThread.id).pipe(
              toArray(),
              concatMap(replies => of({
                ...commentThread,
                replies: _.flatten(replies)
              }))
            );
          })
        );

        if (response.nextPageToken) {
          const nextPageParams = this.buildCommentsRequestParams(videoId, response.nextPageToken);
          return commentThreads.pipe(merge(this.fetchAllComments(videoId, nextPageParams)));
        }

        return commentThreads;
      })
    )
  }

  /**
   * Fetches comment replies to a top-level comment from the platform's server.
   * @param commentId The ID of the top-level comment of which replies are fetched.
   * @returns An `Observable` that returns comment replies as an object in {@link https://developers.google.com/youtube/v3/docs/comments#resource YouTube's format}.
   */
  private fetchReplies(commentId: string): Observable<any> {
    const params = this.buildRepliesRequestParams(commentId);
    return this.fetchAllReplies(commentId, params);
  }

  /**
   * Recurring method to fetch all comment replies to a top-level comment.
   * @param commentId The ID of the top-level comment of which replies are fetched.
   * @param params Request parameters for {@link https://developers.google.com/youtube/v3/docs/comments/list#http-request YouTube's comment API}.
   * @returns An `Observable` that returns comment replies as an object in {@link https://developers.google.com/youtube/v3/docs/comments#resource YouTube's format}.
   */
  private fetchAllReplies(commentId: string, params: {[param: string]: string | string[]}): Observable<any> {
    return this.http.get(this.API_URL_REPLIES, { params }).pipe(
      concatMap((result: any) => {
        if (result.nextPageToken) {
          const nextParams = this.buildRepliesRequestParams(commentId, result.nextPageToken);
          return this.fetchAllReplies(commentId, nextParams).pipe(startWith(result.items));
        }
        return of(result.items);
      })
    );
  }

  /**
   * Extracts the post ID from a video post's URL.
   * @param videoUrl The URL to the post.
   * @returns The post ID if found; `undefined` otherwise.
   */  
  public extractPostId(videoUrl: string): string | undefined {
    const match = videoUrl.match(this.urlRegExp);
    return (match && match[1].length==11)? match[1] : undefined;
  }

  /**
   * Determines if a post URL is a valid URL of the platform.
   * @param postUrl The post URL to the post.
   * @returns `true` if the URL is valid; `false` otherwise.
   */
  public isPlatformUrl(postUrl: string): boolean {
    return postUrl.match(this.urlRegExp) ? true : false;
  }

  /**
   * Returns the URL to a post from a valid post ID.
   * @param videoId The ID of the post to get URL of.
   * @returns URL to the post.
   */
  private getPostUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  /**
   * Utility function to generate the request parameters for {@link https://developers.google.com/youtube/v3/docs/videos/list#parameters YouTube's video API}.
   * @param videoId The ID of the post to fetch data of.
   * @returns The parameters represented in an object.
   */
  private buildPostRequestParams(videoId: string): {[param: string]: string | string[]} {
    return {
      part: ['id', 'statistics', 'snippet'].join(','),
      key: this.API_KEY,
      id: videoId
    };
  }

  /**
   * Utility function to generate the request parameters for {@link https://developers.google.com/youtube/v3/docs/commentThreads/list#parameters YouTube's comment thread API}.
   * @param videoId The ID of the post to fetch the comment data from.
   * @param pageToken The specific page number in the comments to fetch from. If no value is provided, comment data is fetched from the beginning.
   * @returns The parameters represented in an object.
   */
  private buildCommentsRequestParams(videoId: string, pageToken?: string): {[param: string]: string | string[]} {
    return {
      part: ['id', 'snippet', 'replies'].join(','),
      maxResults: '100',
      textFormat: 'plainText',
      key: this.API_KEY,
      videoId,
      ...(pageToken ? { pageToken } : {})
    };
  }

  /**
   * Utility function to generate the request parameters for {@link https://developers.google.com/youtube/v3/docs/comments/list#parameters YouTube's comment API}.
   * @param commentId The ID of the top-level comment of which replies are fetched.
   * @param pageToken The specific page number in the replies to fetch from. If no value is provided, comment reply data is fetched from the beginning.
   * @returns The parameters represented in an object.
   */
  private buildRepliesRequestParams(commentId: string, pageToken?: string): {[param: string]: string | string[]} {
    return {
      part: ['id', 'snippet'].join(','),
      maxResults: '100',
      textFormat: 'plainText',
      key: this.API_KEY,
      parentId: commentId,
      ...(pageToken ? { pageToken } : {})
    };
  }

  /**
   * Utility function to convert {@link https://developers.google.com/youtube/v3/docs/videos#resource-representation YouTube's video data} into a `RawSocialPost`.
   * @param platformPostData Video post data in {@link https://developers.google.com/youtube/v3/docs/videos#resource-representation YouTube's format}.
   * @returns Post as a `RawSocialPost` object.
   */
  private platformPostDataToRawSocialPost(platformPostData: any): RawSocialPost {
    return {
      id: platformPostData.id,
      content: platformPostData.snippet.title,
      authorName: platformPostData.snippet.channelTitle,
      publishTimestamp: Date.parse(platformPostData.snippet.publishedAt),
      likeCount: platformPostData.statistics.likeCount,
      commentCount: platformPostData.statistics.commentCount,
      raw: platformPostData,
      platform: SocialPlatform.YOUTUBE,
      sourceUrl: this.getPostUrl(platformPostData.id)
    };
  }

  /**
   * Utility function to convert {@link https://developers.google.com/youtube/v3/docs/commentThreads#resource-representation YouTube's comment thread data} into a `RawSocialComment`.
   * @param platformCommentThreadData Comment thread data in {@link https://developers.google.com/youtube/v3/docs/commentThreads#resource-representation YouTube's format}.
   * @returns Comment as a `RawSocialComment` object.
   */
  private platformCommentDataToRawSocialComment(platformCommentThreadData: any): RawSocialComment[] {
    return this.assignParentId(
      {
        ...this.platformReplyDataToRawSocialComment(platformCommentThreadData.snippet.topLevelComment),
        postId: platformCommentThreadData.snippet.videoId,
      }, 
      platformCommentThreadData.replies
      .map((reply: any): RawSocialComment => {
        return ({
          ...this.platformReplyDataToRawSocialComment(reply),
          postId: platformCommentThreadData.snippet.videoId,
        })
      })
      .sort((rawSocialCommentA: RawSocialComment, rawSocialCommentB: RawSocialComment) => rawSocialCommentA.publishTimestamp - rawSocialCommentB.publishTimestamp)
    );
  }

  /**
   * Utility function to convert {@link https://developers.google.com/youtube/v3/docs/comments#resource-representation YouTube's comment data} into a `RawSocialComment`.
   * @param platformPostData Comment data in {@link https://developers.google.com/youtube/v3/docs/comments#resource-representation YouTube's format}.
   * @returns Comment as a `RawSocialComment` object.
   */
  private platformReplyDataToRawSocialComment(platformCommentData: any): RawSocialComment {
    return {
      id: platformCommentData.id,
      content: platformCommentData.snippet.textDisplay.replace(/\u200B/g,''),
      authorName: platformCommentData.snippet.authorDisplayName.replace(/\u200B/g,''),
      publishTimestamp: Date.parse(platformCommentData.snippet.publishedAt),
      likeCount: platformCommentData.snippet.likeCount,
      commentCount: 0,
      comments: [],
      parentCommentId: null,
      parentAuthorName: null,
      postId: null,
      raw: platformCommentData
    }
  }

  /**
   * Nests comment replies under their parent comment (the comment they are replying to).
   * @param rootComment The top-level comment. It is a direct comment under a post.
   * @param replies The comment replies made under the root comment.
   * @returns The top-level comment.
   */
  private assignParentId(rootComment: RawSocialComment, replies: RawSocialComment[]): RawSocialComment[] {

    const knownAuthors = new Set([rootComment.authorName]);

    replies.reduce((map, reply) => {

      const replyPattern =  new RegExp(`(${[...knownAuthors].map(author => `${_.escapeRegExp(author)}`).join('|')})`);
      const authorTagged = reply.content.match(replyPattern);
      const replyToAuthor = authorTagged ? authorTagged[1] : null;

      const parentComment = map.get(replyToAuthor) || rootComment;

      reply.parentAuthorName = parentComment.authorName;
      reply.parentCommentId = parentComment.id;

      parentComment.commentCount++;

      map.set(reply.authorName, reply);

      knownAuthors.add(reply.authorName);

      return map;
    }, new Map([
      [null, rootComment],
      [rootComment.authorName, rootComment]
    ]));

    return [rootComment, ...replies];
  }

}
