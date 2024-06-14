import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {

  constructor(private goodLook: GoodlookService) {}

  isLogged: boolean = false;
  isAdmin: boolean = false;
  token: string | null= localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  ngOnInit(): void {
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
