import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Pipe to mark HTML texts as safe to execute.
 */
@Pipe({
  name: 'sanitizeHtml'
})
export class SanitizeHtmlPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  /**
   * Allows code within a HTML text to bypass security checks and be executed.
   * @param text HTML text containing code that should be executed.
   * @returns HTML that is marked as safe to execute.
   */
  transform(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(text);
  }

}
