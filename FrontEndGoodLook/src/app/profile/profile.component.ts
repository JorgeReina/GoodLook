import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';
import { User } from 'src/model/User';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {

  data!: User;
  barberList: any;
  token: string | null= localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  loader: boolean = true;
  img: boolean = false;

  myForm: FormGroup;
  email: string = '';
  password: string='';

  constructor(private goodLook: GoodlookService, private formBuilder: FormBuilder) {
    this.myForm = this.formBuilder.group({
      nombre: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    if (this.token) {
      this.goodLook.getUserById(this.id, this.token).subscribe(
        (response) => {
          this.data = response;
        },
        (error) => {
          console.error('Error al obtener los datos:', error);
        }
      );
      this.getBarberList();
    } else {
      console.error('No se encontró el token');
      /* 
      setTimeout(() => {
        this.loader = false;
        this.img = true;
      }, 500)
      */
    }
  }

  deleteUser() {
    this.goodLook.deleteUser(this.id, this.token).subscribe(
      response => {
        console.log('Usuario eliminado con éxito', response);
      },
      error => {
        console.error('Error al eliminar el usuario', error);
      }
    );
  }

  closeSession() {
    sessionStorage.removeItem("JWT");
    sessionStorage.removeItem("ID");
    localStorage.removeItem("JWT");
    localStorage.removeItem("ID");
  }

  getBarberList() {
    this.goodLook.getBarberList(this.token,).subscribe(
      response => {
        this.barberList = response;
      },
      error => {
        console.error('Error al llamar getBarberList', error);
      }
    );
  }

  async createBarber() {
    const formData = new FormData();
    formData.append('name', this.myForm.get('nombre')?.value);
    formData.append('email', this.myForm.get('email')?.value);
    formData.append('password', this.myForm.get('password')?.value);

    if(this.myForm.get('confirmPassword')?.value == this.myForm.get('password')?.value){
  
      this.goodLook.createBarber(this.token, formData).subscribe(
        response => {
          console.log('Barbero creado con éxito', response);
        },
        error => {
          console.error('Error al crear el barbero', error);
        }
      );
  
      alert('Registro exitoso.');

    } else {
      alert('Registro incorrecto, compruebe su contraseña');
    }
  }

  deleteBarber(email: string) {

    this.goodLook.deleteBarber(this.token, email).subscribe(
      response => {
        console.log('Barbero eliminado con éxito', response);
      },
      error => {
        console.error('Error al eliminar el barbero', error);
      }
    );

  }

  reloadPage() {
    window.location.reload();
  }

}
