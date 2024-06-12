import { Component } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { GoodlookService } from '../goodlook.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {

  API_URL : string = 'https://localhost:7234/';

  myForm: FormGroup;
  email: string = '';
  password: string='';

  constructor(private formBuilder: FormBuilder, private httpClient: HttpClient,private router: Router) {
    this.myForm = this.formBuilder.group({
      nombre: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
    });
  }

  async signUser() {
    const formData = new FormData();
    formData.append('name', this.myForm.get('nombre')?.value);
    formData.append('email', this.myForm.get('email')?.value);
    formData.append('password', this.myForm.get('password')?.value);

    if(this.myForm.get('confirmPassword')?.value == this.myForm.get('password')?.value){
  
    const request$ = this.httpClient.post<string>(`${this.API_URL}api/User/signup`, formData);
    await lastValueFrom(request$);
  
    alert('Registro exitoso.');
    this.router.navigate(['/sign-in']);
    } else {
      alert('Registro incorrecto, compruebe su contraseña');
    }
  }
}

