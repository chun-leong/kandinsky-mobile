import * as d3 from "d3";
import { RawSocialComment, RawSocialPost, SocialComment, SocialPost } from "./models/models";
import { ConcentricCircle } from "./kandinsky-interface/canvas/canvas.component";
import { LoadingController, ToastController } from "@ionic/angular";
import { TOAST_DURATION_MS } from 'src/app/config';

/**
 * Finds all instances of a query string in a text.
 * @param queryRegex RegEx of query string to search for.
 * @param text Text to search from.
 * @returns Array of indices within the text where the query string is found.
 */
export function getIndices(queryRegex: RegExp, text: string): [number, number][] {    
    const matches = [];
    let match = null;

    while ((match = queryRegex.exec(text)) != null) {
        matches.push(match);
    }

    return matches.map(match => [match.index, match.index + match[0].length]);
}

/**
   * Converts `RawSocialComment` to `SocialComment` where analytic data can be stored.
   * @param comment `RawSocialComment` object to convert.
   * @returns Converted `SocialComment` object.
   */
export function mapToSocialComment(comment: RawSocialComment): SocialComment {
    return {
        ...comment,
        comments: comment.comments.map(subcomment => mapToSocialComment(subcomment)),
        analytics: {
            similarCommentScores: {},
            topics: null
        }
    };
}

/**
   * Converts `RawSocialPost` to `SocialPost` where Kandinsky data can be stored.
   * @param post `RawSocialPost` object to convert.
   * @returns Converted `SocialPost` object.
   */
export function mapToSocialPost(post: RawSocialPost): SocialPost {
    return {
      ...post,
      metadata: {
        archived: false,
        archiveTimestamp: null,
        createTimestamp: null,
        lastUpdateTimestamp: null,
        lastAccessTimestamp: null,
        commentsMetadata: {
          lastUpdateTimestamp: null,
          lastAnalysisTimestamp: null,
          firstTimestamp: null,
          lastTimestamp: null
        }
      }
    };
}

/**
 * Creates a `d3` `LinearScale` from specified values.
 * @param domainMin minimum value of domain (input).
 * @param domainMax maximum value of domain (input).
 * @param rangeMin minimum value of range (output).
 * @param rangeMax maximum value of range (output).
 * @returns `d3.ScaleLinear` object.
 */
export function buildLinearScale(domainMin, domainMax, rangeMin, rangeMax): d3.ScaleLinear<number, number> {
    return d3.scaleLinear()
      .domain([domainMin, domainMax])
      .range([rangeMin, rangeMax]);
}

/**
 * Type guard for `ConcentricCircleDatum` objects.
 * @param object Object to be used in the type guard.
 * @returns `true` if object is a `ConcentricCircleDatum`; `false` otherwise.
 */
export function isConcentricCircleDatum(object: any): object is ConcentricCircle {
    return "pivot" in object;
}

/**
 * Concatenates two strings with an underscore separating them.
 * @param string1 First string in the result string, i.e. left of the underscore.
 * @param string2 Second string in the result string, i.e. right of the underscore.
 * @returns Concatenated string, i.e. "string1_string2".
 */
export function underscoreJoin(string1: string, string2: string) {
    return `${string1}_${string2}`;
}

/**
 * Displays toast on page.
 * @param message text to display on toast
 */
export async function displayToast(toastController: ToastController, message: string) {
    const toast = await toastController.create({
        message,
        duration: TOAST_DURATION_MS
    });
    await toast.present();
}

/**
 * Creates loading spinner overlay.
 * @param loadingController The loading controller module on the page where the overlay is needed.
 * @param message Optional string to display beside the spinner.
 * @returns The loading overlay as an `HTMLIonLoadingElement`.
 */
export async function createLoading(loadingController: LoadingController, message?: string) {
    return await loadingController.create({
        mode: 'ios',
        message
    })
}

 /**
   * Transitions to an element on the page.
   * @param elementId HTML ID of the element.
   */
 export function scrollToElement(elementId: string): void {
    setTimeout(() => {
      const target = document.getElementById(elementId);
      target.scrollIntoView({
        behavior: 'smooth'
      });
    });
  }