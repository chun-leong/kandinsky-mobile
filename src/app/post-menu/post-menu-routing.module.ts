import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PostMenuPage } from './post-menu.page';

const routes: Routes = [
  {
    path: '',
    component: PostMenuPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PostMenuPageRoutingModule {}
