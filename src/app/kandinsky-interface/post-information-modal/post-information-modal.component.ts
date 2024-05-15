import { Component, OnInit } from '@angular/core';
import { AlertController, NavParams, ToastController } from '@ionic/angular';
import { SocialPost } from 'src/app/models/models';
import { displayToast } from 'src/app/utils';

/**
 * Displays information about a post. Allows user to fetch updated data from the platform server or delete the active post from storage.
 */
@Component({
  selector: 'ksky-post-information-modal',
  templateUrl: './post-information-modal.component.html',
  styleUrls: ['./post-information-modal.component.scss'],
})
export class PostInformationModalComponent implements OnInit {

  protected post: SocialPost;

  constructor(
    private alertController: AlertController,
    private toastController: ToastController,
    private navParams: NavParams
  ) {}

  ngOnInit() {
    this.post = this.navParams.get('post');
  }

  /** Copies textual data to the user's clipboard. */
  protected async copyText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    await displayToast(this.toastController, 'Copied to clipboard');
  }

  /** Copies time data  to the user's clipboard. */
  protected async copyDatetime(datetimeText: string): Promise<void> {
    await navigator.clipboard.writeText(new Date(datetimeText).toLocaleString());
    await displayToast(this.toastController, 'Copied to clipboard');
  }

  /** Displays menu for fetching updated data from the platform's server. */
  protected async displayReloadDataAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reload post data?',
      subHeader: 'This will delete cached data for this post and re-run data extraction.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Yes, reload data',
          role: 'confirm',
          handler: async () => {
            this.navParams.get('reloadDataHandler')();
            this.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  /** Displays menu for deleting the active post from storage. */
  protected async displayDeletePostAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete this post?',
      subHeader: 'This will permanently delete all data extracted related to this post.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Yes, delete post',
          role: 'confirm',
          handler: async () => {
            await this.navParams.get('deletePostHandler')();
            this.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  /** Closes the post information window. */
  protected async dismiss(): Promise<void> {
    await this.navParams.get('dismissPostInformation')();
  }

}
