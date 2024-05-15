import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { PostMenuPageRoutingModule } from './post-menu-routing.module';
import { PostMenuPage } from './post-menu.page';
import { MomentModule } from 'ngx-moment';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PostMenuPageRoutingModule,
    MomentModule
  ],
  declarations: [PostMenuPage]
})
export class PostMenuPageModule {}
