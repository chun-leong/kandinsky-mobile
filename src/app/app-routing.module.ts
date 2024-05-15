import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'post-menu', pathMatch: 'full' },
  {
    path: 'kandinsky-interface/:platform/:id',
    loadChildren: () => import('./kandinsky-interface/kandinsky-interface.module').then( m => m.KandinskyInterfacePageModule)
  },
  {
    path: 'post-menu',
    loadChildren: () => import('./post-menu/post-menu.module').then( m => m.PostMenuPageModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
