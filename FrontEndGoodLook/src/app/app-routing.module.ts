import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { BodyComponent } from './body/body.component'
import { Page404Component } from './page404/page404.component';
import { SignupComponent } from './signup/signup.component';
import { SigninComponent } from './signin/signin.component';

const routes: Routes = [
  { path: 'inicio', component: BodyComponent},
  { path: 'sign-up', component: SignupComponent},
  { path: 'sign-in', component: SigninComponent},
  { path: '', redirectTo: 'inicio', pathMatch: 'full'},
  {path: '**', component: Page404Component},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
