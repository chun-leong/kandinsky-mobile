import { TopicInfos } from '../services/analytics.service';

/** Most basic representation of any user-submitted content. */
type SocialItem = {
  id: string;
  content: string;
  authorName: string;
  publishTimestamp: number;
  likeCount: number;
  commentCount: number;
  raw: any;
};

/** Represents source information about a user-submitted post. */
export type RawSocialPost = SocialItem & {
  platform: SocialPlatform;
  sourceUrl: string;
};

/** Represents data about comments of a post. */
export type PostCommentsMetadata = {
  lastUpdateTimestamp: number;
  lastAnalysisTimestamp: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

/** Represents data about a post. */
export type PostMetadata = {
  archived: boolean;
  archiveTimestamp: number;
  createTimestamp: number;
  lastUpdateTimestamp: number;
  lastAccessTimestamp: number;
  commentsMetadata: PostCommentsMetadata;
};

/** Represents a post and its metadata. */
export type SocialPost = RawSocialPost & {
  metadata: PostMetadata;
};

/** Represents a user-submitted comment. */
export type RawSocialComment = SocialItem & {
  postId: string;
  parentCommentId: string;
  parentAuthorName: string;
  comments: RawSocialComment[];
};

/** Represents topic analysis of a comment. */
export type CommentAnalytics = {
  similarCommentScores: {[commentId: string]: number};
  topics: TopicInfos;
};

/** Represents a comment with topic analytic data. */
export type SocialComment = Omit<RawSocialComment, 'comments'> & {
  comments: SocialComment[];
  analytics: CommentAnalytics;
};

/** The social platforms supported by the application. */
export enum SocialPlatform {
  YOUTUBE = 'Youtube, LLC'
};
