import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.css']
})
export class SigninComponent {

  //https://appgoodlook.runasp.net/
  //https://localhost:7234/

  API_URL : string = 'https://appgoodlook.runasp.net/';

  myForm: FormGroup;
  email: string = '';
  password: string='';

  constructor(private httpClient: HttpClient,private formBuilder: FormBuilder,private router: Router) {
    this.myForm = this.formBuilder.group({
      email: ['', Validators.required],
      password: ['', Validators.required],
      recordar: ['',]
    });
  }

 async signInUser() {
    const formData = new FormData();
    const options: any = {responseType:"text"};
    formData.append('email', this.myForm.get('email')?.value);
    formData.append('password', this.myForm.get('password')?.value);

    try{
      const request$ = this.httpClient.post<string>(`${this.API_URL}api/User/login/`, formData,options);
      var event: any = await lastValueFrom(request$);
      
      alert('Sesión iniciada con éxito');
      event=JSON.parse(event)
      if(this.myForm.get('recordar')?.value){
        this.setLocal(event.stringToken,event.id);
      }else{
        this.setSession(event.stringToken,event.id);
      }
      this.router.navigate(['/profile']).then(() => {
        window.location.href = window.location.href;
      });
    }catch(error){
      alert('E-mail o contraseña incorrecto/s');
    } 
  }
  setSession(token: string,id:string){
    sessionStorage.setItem("JWT",token);
    sessionStorage.setItem("ID",id);
  }
  setLocal(token: string,id:string){
    localStorage.setItem("JWT",token);
    localStorage.setItem("ID",id);
  }
}
