import { Injectable } from '@angular/core';
import * as lda from 'lda';
import * as similarity from 'compute-cosine-similarity';
import _ from 'lodash';
import { getIndices } from '../utils';
import { SIMILARITY_THRESHOLD_DEFAULT, TERMS_PER_COMMENT } from '../config';
import { SocialComment } from '../models/models';

/**
 * Provides topical analysis services to enhance post and comment data.
 */
@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {

  private TERMS_PER_COMMENT = TERMS_PER_COMMENT;
  public SIMILARITY_THRESHOLD = SIMILARITY_THRESHOLD_DEFAULT;

  constructor() {}

  /**
   * Utilises a third-party implementation of {@link https://github.com/primaryobjects/lda Latent Dirichlet Allocation (LDA)} to identify topic terms.
   * @param text Textual data to identify topics from.
   * @param numTerms The maximum number of topic terms to identify.
   * @returns The identified topic terms and their associated information.
   */
  public identifyTopics(text: string, numTerms: number = this.TERMS_PER_COMMENT): TopicInfos {
    var sentences = text.match(/[^\.!\?]+[\.!\?]+/g);
    const topics: { term: string, probability: number }[] = lda(sentences, 1, numTerms)[0] || [];
    
    const topicMap = {};
    topics.forEach(topic => {
      const topicTermRegex = new RegExp(_.escapeRegExp(topic.term), 'gi');

      topicMap[topic.term] = {
        indices: getIndices(topicTermRegex, text),
        probability: topic.probability
      };
    })

    return topicMap;
  }

  /**
   * Computes cosine similarity between two comments using their topic probabilities.
   * @returns Cosine similarity as a float between 0 and 1 where 1 is most similar.
   */
  public calculateTopicSimilarity(socialComment1: SocialComment, socialComment2: SocialComment): number {
    const topics1 = socialComment1.analytics.topics;
    const topics2 = socialComment2.analytics.topics;

    const combinedTerms = new Set([...Object.keys(topics1), ...Object.keys(topics2)]);

    const probabilityVector1 = [...combinedTerms].map(term => term in topics1 ? topics1[term].probability : 0);
    const probabilityVector2 = [...combinedTerms].map(term => term in topics2 ? topics2[term].probability : 0);
    
    return similarity(probabilityVector1, probabilityVector2);
  }

}

/** Comment-specific information about topic terms in the text. */
export type TopicInfo = {
  /** Positions where the term was identified in the text. */
  indices: [number, number][];
  /** Likelihood of the entire text belonging to this topic determined using LDA. */
  probability: number;
}

/** Mapping of the topic terms to their topic info. */
export type TopicInfos = {
  [topicTerm: string]: TopicInfo
}