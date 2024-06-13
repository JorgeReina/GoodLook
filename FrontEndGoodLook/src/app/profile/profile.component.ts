import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';
import { User } from 'src/model/User';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {

  data!: User;
  token: string | null= localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  constructor(private goodLook: GoodlookService) {}

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

  reloadPage() {
    window.location.reload();
  }

}
