import { Injectable } from "@angular/core";
import { YoutubeService } from "./youtube.service";
import { SocialPlatform, SocialPost, SocialComment } from "src/app/models/models";
import { SocialService } from "./social.service";
import _ from "lodash";

/**
 * Factory class that manages calls to each platform's social service.
 * Abstracts the logic of selecting the right social service implementation in each method call.
 */
@Injectable({
    providedIn: 'root'
})
export class SocialServiceFactory {

  private readonly SUPPORTED_PLATFORMS: Map<SocialPlatform, SocialService> = new Map([
    [SocialPlatform.YOUTUBE, this.youtubeService]
  ]);

  constructor (
    private youtubeService: YoutubeService,
  ) {}

  /**
   * Retrieves posts saved in storage.
   * @returns Array of posts saved in storage.
   */
  public async getPostsFromStorage(): Promise<SocialPost[]> {
    const socialServices = [...this.SUPPORTED_PLATFORMS.values()];
    const posts = _.flatten(await Promise.all(
      socialServices.map(socialPlatform => socialPlatform.getPostsFromStorage())
    ));
    return posts;
  }

  /**
   * Retrieves post from storage or fetches from the platform's server if a saved version is not available.
   * @param videoId The ID of the post to retrieve.
   * @param fromStorage Indicates whether to retrieve data from storage.
   * @param saveToStorage Indicates whether to save data to storage.
   * @returns A `Promise` that resolves with the post.
   */
  public async getPost(postId: string, platform: SocialPlatform, fromStorage: boolean = true, saveToStorage: boolean = true): Promise<SocialPost> {
    const socialPlatform = this.SUPPORTED_PLATFORMS.get(platform);
    return await socialPlatform.getPost(postId, fromStorage, saveToStorage);
  }

  /**
   * Retrieves comments associated to a post from storage or fetches from the platform's server if a saved version is not available.
   * @param postId The ID of the post to retrieve the comments of.
   * @param fromStorage Indicates whether to retrieve data from storage.
   * @param saveToStorage Indicates whether to save data to storage.
   * @returns A `Promise` that resolves with the comments.
   */
  public async getComments(postId: string, platform: SocialPlatform, saveToStorage: boolean = true, fromStorage: boolean = true): Promise<SocialComment[]> {
    const socialPlatform = this.SUPPORTED_PLATFORMS.get(platform);
    return await socialPlatform.getComments(postId, fromStorage, saveToStorage);
  }

  /**
   * Updates data associated with a post. Used to centralise saving to storage and ensuring metadata is correctly updated. 
   * Each optional parameter supplied in the function updates different parts of the post metadata.
   * @param postId ID of the post to update data of.
   * @param topicCount (Optional) The identified topics and the number of comments associated with each topic. Used when topic info for the post is made available.
   * @param updatedComments (Optional) Comments associated with the post. Used when comment data for the post is updated.
   * @param areCommentsAnalyzed (Optional) Indicates if the comments contain analysis data. Used when `updatedComments` is provided.
   * @returns A `Promise` that resolves with the updated post.
   */
  public async updatePostData(postId: string, platform: SocialPlatform, {
    updatedComments = [],
    areCommentsAnalyzed = false} = {}): Promise<SocialPost> {
    const socialPlatform = this.SUPPORTED_PLATFORMS.get(platform);
    return await socialPlatform.updatePostData(postId, {updatedComments: updatedComments, areCommentsAnalyzed});
  }


  /**
   * Removes post data from storage.
   * @param postId The ID of the post to delete.
   * @param includeComments Indicates if comment data of the post should be removed.
   */
  public async deletePost(postId: string, platform: SocialPlatform, deleteComments: boolean = true): Promise<void> {
    const socialPlatform = this.SUPPORTED_PLATFORMS.get(platform);
    await socialPlatform.deletePost(postId, deleteComments);
  }

  /**
   * Extracts the post ID from a post's URL.
   * @param postUrl The URL to the post.
   * @returns The post ID if found; `undefined` otherwise.
   */
  public extractPostId(postUrl: string): string | undefined {
    for (let socialPlatform of this.SUPPORTED_PLATFORMS.values()) {
      const postId = socialPlatform.extractPostId(postUrl);
      if (postId) return postId;
    }
  }

  /**
   * Determines if a post URL is a valid URL of the platform.
   * @param postUrl The post URL to the post.
   * @returns `true` if the URL is valid; `false` otherwise.
   */
  public extractPlatform(postUrl: string): SocialPlatform | undefined {
    for (let [socialPlatform, socialService] of this.SUPPORTED_PLATFORMS) {
      if (socialService.isPlatformUrl(postUrl)) return socialPlatform;
    }
  }
}