import { Observable } from 'rxjs';
import { SocialPost, SocialComment, RawSocialPost, RawSocialComment, PostCommentsMetadata } from 'src/app/models/models';
import { map, toArray, distinct } from 'rxjs/operators';
import { mapToSocialComment, mapToSocialPost } from 'src/app/utils';
import * as d3 from 'd3';

/**
 * Service module abstraction to handle post, comment and comment replies data retrieval.
 * To be implemented for each unique social media platform supported by the application.
 */
export abstract class SocialService {

  private posts: SocialPost[];

  constructor (
    private postStorage: LocalForage,
    private commentStorage: LocalForage
  ) {}

  /**
   * Retrieves posts saved in storage.
   * @returns Array of posts saved in storage.
   */
  public async getPostsFromStorage(): Promise<SocialPost[]> {
    const postIds = await this.postStorage.keys();
    this.posts = await Promise.all(postIds.map(postId => 
      this.postStorage.getItem<SocialPost>(postId)
    ));
    return this.posts;
  }
  
  /**
   * Retrieves post from storage or fetches from the platform's server if a saved version is not available.
   * @param videoId The ID of the post to retrieve.
   * @param fromStorage Indicates whether to retrieve data from storage.
   * @param saveToStorage Indicates whether to save data to storage.
   * @returns A `Promise` that resolves with the post.
   */
  public async getPost(postId: string, fromStorage: boolean = true, saveToStorage: boolean = true): Promise<SocialPost> {
    let socialPost: SocialPost;

    if (fromStorage) {
      socialPost = await this.updatePostData(postId, {wasAccessed: true});
    } 

    if (socialPost) {
      console.log("Returning post from storage");
    }

    return socialPost || await this.getPostFromPlatform(postId, saveToStorage);
  }

  /**
   * Fetches post data from the platform's server.
   * @param postId The ID of the post to fetch.
   * @returns An `Observable` that returns the post as a `RawSocialPost` object.
   */
  protected abstract fetchPost(postId: string): Observable<RawSocialPost>;

  /**
   * Fetches post data from the platform's server and converts it into a `SocialPost`.
   * @param postId The ID of the post to fetch.
   * @param saveToStorage Indicates whether to save data to storage.
   * @returns A `Promise` that resolves with the post.
   */
  private async getPostFromPlatform(postId: string, saveToStorage: boolean): Promise<SocialPost> {
    console.time('Fetch post from platform');

    const socialPost = await this.fetchPost(postId).pipe(
      map(rawSocialPost => mapToSocialPost(rawSocialPost)),
    )
    .toPromise();

    console.timeEnd('Fetch post from platform')
    console.log(`Successfully fetched post ${postId}`);

    if (!saveToStorage) {
      console.warn(`Skipping saving of post ${postId} to storage`);
      return socialPost;
    }

    return await this.updatePostData(postId, {updatedPost: socialPost, wasAccessed: true});
  }

  /**
   * Retrieves post from storage.
   * @param postId The ID of the post to retrieve.
   * @returns A `Promise` that resolves with the post or null if the post does not exist in storage.
   */
  private async getPostFromStorage(postId: string): Promise<SocialPost> {
    let socialPost: SocialPost;

    if (this.posts) {
      socialPost = this.posts.find(post => post.id === postId);
    }

    socialPost = socialPost || await this.postStorage.getItem<SocialPost>(postId);

    if (!socialPost) {
      console.warn(`No post ${postId} found in storage`);
    } else {
      console.log(`Found post ${postId} in storage`);
    }

    return socialPost;
  }

  /**
   * Retrieves comments associated to a post from storage or fetches from the platform's server if a saved version is not available.
   * @param postId The ID of the post to retrieve the comments of.
   * @param fromStorage Indicates whether to retrieve data from storage.
   * @param saveToStorage Indicates whether to save data to storage.
   * @returns A `Promise` that resolves with the comments.
   */
  public async getComments(postId: string, fromStorage: boolean, saveToStorage: boolean = true): Promise<SocialComment[]> {
    if (fromStorage) {
      const storedComments = await this.getCommentsFromStorage(postId);

      if (storedComments) {
        console.log("Returning comments from storage");
        return storedComments;
      }

      return await this.getCommentsFromPlatform(postId, saveToStorage);
    }
    return await this.getCommentsFromPlatform(postId, saveToStorage);;
  }

  /**
   * Fetches comment data of a post from the platform's server.
   * @param postId The ID of the post to fetch the comment data from.
   * @returns An `Observable` that returns the comment data as `RawSocialComment` objects.
   */
  protected abstract fetchComments(postId: string): Observable<RawSocialComment>;

  /**
   * Fetches comment data from the platform's server and converts them into an array of `SocialComment` objects.
   * @param postId The ID of the post to retrieve the comments of.
   * @returns A `Promise` that resolves with the comments.
   */
  private async getCommentsFromPlatform(postId: string, saveToStorage: boolean): Promise<SocialComment[]> {
    console.time('Fetch comments from platform');
    const comments = await this.fetchComments(postId).pipe(
      distinct(comment => comment.id),
      map(comment => mapToSocialComment(comment)),
      toArray()
    )
    .toPromise();

    console.timeEnd('Fetch comments from platform')
    console.log(`Successfully fetched comments of post ${postId}`);

    if (!saveToStorage) {
      console.warn(`Skipping saving commments of post ${postId} to storage`);
      return comments;
    }

    await this.updatePostData(postId, {updatedComments: comments});

    return comments;
  }

  /**
   * Retrieves comment data of a post from storage.
   * @param postId The ID of the post to retrieve the comments of.
   * @returns A `Promise` that resolves with the comments.
   */
  private async getCommentsFromStorage(postId: string): Promise<SocialComment[]> {
    const comments = await this.commentStorage.getItem<SocialComment[]>(postId);

    if (comments) {
      console.log(`Found comments of post ${postId} in storage`);
    } else {
      console.warn(`No comments of post ${postId} was found in storage`);
    }

    return comments;
  }


  /**
   * Updates data associated with a post. Used to centralise saving to storage and ensuring metadata is correctly updated. 
   * Each optional parameter supplied in the function updates different parts of the post metadata.
   * @param postId ID of the post to update data of.
   * @param newPost (Optional) Newly fetched version of the post data is being saved. Used when creating a new saved post in storage.
   * @param wasAccessed (Optional) Indicates if the post was just accessed. Used when user accesses a post's contents.
   * @param topicCount (Optional) The identified topics and the number of comments associated with each topic. Used when topic info for the post is made available.
   * @param updatedComments (Optional) Comments associated with the post. Used when comment data for the post is updated.
   * @param areCommentsAnalyzed (Optional) Indicates if the comments contain analysis data. Used when `updatedComments` is provided.
   * @returns A `Promise` that resolves with the updated post.
   */
  public async updatePostData(postId: string, {
    updatedPost = null,
    wasAccessed = false,
    topicCount = null,
    updatedComments = [],
    areCommentsAnalyzed = false} = {}): Promise<SocialPost> {
    if (!updatedPost && !topicCount && !updatedComments.length && !areCommentsAnalyzed && !wasAccessed) {
      return;
    }
        
    const post = updatedPost || await this.getPostFromStorage(postId);
    
    if (!post) {
      console.warn(`Attempted to update post ${postId} comments metadata but post was not found.\nNo action taken.`);
      return;
    }

    const now = new Date().getTime();

    if (updatedPost) {
      post.metadata.createTimestamp = now;
      post.metadata.lastUpdateTimestamp = now;
    }

    if (wasAccessed) {
      post.metadata.lastAccessTimestamp = now;
    }

    if (topicCount) {
      post.topicCount = topicCount;
    }

    if (updatedComments.length) {
      await this.saveComments(postId, updatedComments, areCommentsAnalyzed);

      post.commentCount = updatedComments.length;
      post.metadata.lastUpdateTimestamp = now;
      
      console.time("Post comments metadata time");
      post.metadata.commentsMetadata = this.buildPostCommentsMetadata(updatedComments, now, areCommentsAnalyzed);
      console.timeEnd("Post comments metadata time");
    }

    await this.savePost(post, postId);
    console.log(`Successfully updated post ${postId} comments metadata`);

    return post;
  }

  /** 
   * Saves a post to storage.
   * @param post Post to save.
   * @param storageKey The key to associate to the post in storage. If no value is provided, the post's `id` property is used.
   */
  protected async savePost(post: SocialPost, storageKey?: string): Promise<void> {
    await this.postStorage.setItem(storageKey || post.id, post);
    console.log(`Successfully saved post ${storageKey || post.id}`);
  }

  /**
   * Saves comment data to storage.
   * @param postId ID of post which comments are associated to.
   * @param comments Comments to save.
   * @param isAnalyzed Indicates if comments have analysis data.
   */
  private async saveComments(postId: string, comments: SocialComment[], isAnalyzed: boolean = false): Promise<void> {
    await this.commentStorage.setItem(postId, comments);
    console.log(`Successfully saved ${isAnalyzed ? 'analyzed ' : ''}comments of post ${postId}`);
  }

  /**
   * Removes post data from storage.
   * @param postId The ID of the post to delete.
   * @param includeComments Indicates if comment data of the post should be removed.
   */
  public async deletePost(postId: string, includeComments: boolean = true): Promise<void> {
    
    if (includeComments) {
      await this.deleteComments(postId);
    }
    await this.postStorage.removeItem(postId);
    console.log(`Successfully deleted post ${postId}`);
  }

  /**
   * Removes comment data of a post from storage.
   * @param postId The ID of the post to delete the comment data of.
   */
  private async deleteComments(postId: string): Promise<void> {
    await this.commentStorage.removeItem(postId);
    console.log(`Successfully deleted comments of post ${postId}`);
  }

  /**
   * Extracts the post ID from a post's URL.
   * @param postUrl The URL to the post.
   * @returns The post ID if found; `undefined` otherwise.
   */
  public abstract extractPostId(postUrl: string): string | undefined;

  /**
   * Determines if a post URL is a valid URL of the platform.
   * @param postUrl The post URL to the post.
   * @returns `true` if the URL is valid; `false` otherwise.
   */
  public abstract isPlatformUrl(postUrl: string): boolean;

  /**
   * Generates comment metadata for posts.
   * @param comments Array of comments associated with the post.
   * @param updateTimestamp Last update time of comment metadata.
   * @param isAnalyzed Indicates if topic analysis was performed on comments.
   * @returns Metadata represented in an object.
   */
  private buildPostCommentsMetadata(comments: SocialComment[], updateTimestamp: number = new Date().getTime(), isAnalyzed = false): PostCommentsMetadata {
    const timestampDomain = d3.extent(comments, comment => comment.publishTimestamp)

    return {
      lastUpdateTimestamp: updateTimestamp,
      lastAnalysisTimestamp: isAnalyzed ? updateTimestamp : null,
      firstTimestamp: timestampDomain[0],
      lastTimestamp: timestampDomain[1]
    }
  }

}