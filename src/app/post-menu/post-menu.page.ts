import { Component, OnInit } from '@angular/core';
import { KandinskyService } from '../services/kandinsky.service';
import { SocialPost } from '../models/models';
import { AlertController, NavController, LoadingController, ToastController } from '@ionic/angular';
import { createLoading, displayToast } from '../utils';
import _ from 'lodash';

/**
 * Home page of the application. Displays previously saved posts and allows users to add new posts.
 */
@Component({
  selector: 'ksky-post-menu',
  templateUrl: './post-menu.page.html',
  styleUrls: ['./post-menu.page.scss'],
})
export class PostMenuPage implements OnInit {

  private posts: SocialPost[];
  private addPostAlert: HTMLIonAlertElement;

  constructor(
    private kandinskyService: KandinskyService,
    private alertController: AlertController,
    private navController: NavController,
    private loadingController: LoadingController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
  }
  
  ionViewDidEnter() {
    this.createAddPostAlert();
    this.fetchPosts();
  }

  /** Displays menu to allow users to add new posts. */
  public async displayAddPostAlert(): Promise<void> {
    await this.addPostAlert.present();
    this.addPostAlert.onDidDismiss()
    .then(async () => await this.createAddPostAlert());
  }

  /** Creates and pre-loads the menu instance for adding new posts. */
  private async createAddPostAlert(): Promise<void> {
    this.addPostAlert = await this.alertController.create({
      header: 'Add Post',
      subHeader: 'Enter the URL of the social media post to be added. Only Youtube videos are supported at the moment.',
      inputs: [
        {
          name: 'postUrl',
          type: 'url',
          placeholder: 'https://youtube.com/watch?v=...'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add',
          handler: data => {
            const url: string = data.postUrl;

            const postId = this.kandinskyService.extractPostId(url);
            const platform = this.kandinskyService.extractPlatform(url);

            if (!postId) {
              displayToast(this.toastController, 'Unsupported URL provided.');
              return false;
            }

            displayToast(this.toastController, 'Added new post successfully!');
            this.navController.navigateForward(['', 'kandinsky-interface', platform, postId]);
          }
        }
      ]
    });
  }

  
  /** Displays menu for deleting the active post from storage. */
  protected async displayDeletePostAlert(post:SocialPost): Promise<void> {
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
            const loading = await createLoading(this.loadingController);
            await loading.present();
            this.kandinskyService.deletePost(post.id, post.platform, loading);
            await loading.dismiss();
          }
        }
      ]
    });
    await alert.present();
  }


  /** Retrieves and displays posts saved in storage. */
  private async fetchPosts(): Promise<void> {
    const loading = await createLoading(this.loadingController);
    await loading.present();
    const posts = await this.kandinskyService.getPosts();
    this.posts = _.orderBy(posts, post => post.metadata.lastAccessTimestamp, 'desc');
    await loading.dismiss();
  }

}
