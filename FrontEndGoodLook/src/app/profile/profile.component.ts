import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {

  data: any;
  token: string | null= sessionStorage.getItem('JWT'); 

  constructor(private goodLook: GoodlookService) {}

  ngOnInit(): void {
    if (this.token) {
      this.goodLook.getListUser(this.token).subscribe(
        (response) => {
          this.data = response;
        },
        (error) => {
          console.error('Error al obtener los datos:', error);
        }
      );
    } else {
      console.error('No se encontró el token');
      // Puedes manejar el caso donde el token es null aquí
    }
  }

}
