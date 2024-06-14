import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';
import { User } from 'src/model/User';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css']
})
export class NavComponent implements OnInit{

  constructor(private goodLook: GoodlookService) {}

  isLogged: boolean = false;
  isAdmin: boolean = false;
  token: string | null= localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');
  data: User = {
    name: "",
    email: "",
    rol: ""
  };

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
    } else {
      console.error('No se encontró el token');
    }
    this.getLogin()
  }


  async getLogin() {
    let idUser = localStorage.getItem("ID") || sessionStorage.getItem("ID") || '';

    if (idUser !== '') {
      this.isLogged = true;

      try {
        if (this.token) {
          const user: any =  this.goodLook.getUserById(this.id, this.token);

          if (user) {
            this.isAdmin = user.rol == "admin";
          } else {
            this.isAdmin = false;  
          }
        }
        
      } catch (error) {
        console.error('Error al obtener la información del usuario:', error);
      }
    }
  }

}
