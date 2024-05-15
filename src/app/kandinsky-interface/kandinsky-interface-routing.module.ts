import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { KandinskyInterfacePage } from './kandinsky-interface.page';

const routes: Routes = [
  {
    path: '',
    component: KandinskyInterfacePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class KandinskyInterfacePageRoutingModule {}
