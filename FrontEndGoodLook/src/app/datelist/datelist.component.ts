import { Component, OnInit } from '@angular/core';
import { GoodlookService } from '../goodlook.service';
import { User } from 'src/model/User';

@Component({
  selector: 'app-datelist',
  templateUrl: './datelist.component.html',
  styleUrls: ['./datelist.component.css']
})
export class DatelistComponent implements OnInit {

  token: string | null = localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  data!: User;

  loader: boolean = true;
  img: boolean = false;

  dateList: any;
  dateListBarber: any;
  barberList: any[] = [];
  userList: any[] = [];
  barberDict: { [key: string]: any } = {};
  userDict: { [key: string]: any } = {};

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
      this.getDateList();
      this.getBarberList();
      this.getDateListBarber();
      this.getUserList();
    } else {
      console.error('No se encontró el token');
      setTimeout(() => {
        this.loader = false;
        this.img = true;
      }, 1000)
    }
  }

  getDateList() {
    this.goodLook.getDateList(this.token, this.id).subscribe(
      response => {
        this.dateList = response;
      },
      error => {
        console.error('Error al obtener la lista de citas', error);
      }
    );
  }

  getBarberList() {
    this.goodLook.getBarberList(this.token).subscribe(
      response => {
        this.barberList = response;
        this.mapBarbers();
      },
      error => {
        console.error('Error al obtener la lista de barberos', error);
      }
    );
  }

  getDateListBarber() {
    this.goodLook.getDateListBarber(this.token, this.id).subscribe(
      response => {
        this.dateListBarber = response;
      },
      error => {
        console.error('Error al obtener la lista de citas', error);
      }
    );
  }

  getUserList() {
    if (this.token) {
      this.goodLook.getListUser(this.token).subscribe(
        response => {
          this.userList = response;
          this.mapUsers();
        },
        error => {
          console.error('Error al obtener la lista de usuarios', error);
        }
      );
    }
  }

  mapBarbers() {
    this.barberList.forEach(barber => {
      this.barberDict[barber.id] = barber;
    });
  }

  mapUsers() {
    this.userList.forEach(user => {
      this.userDict[user.id] = user;
    });
  }

  getBarberName(barberId: string): string {
    const barber = this.barberDict[barberId];
    return barber ? barber.name : 'Unknown';
  }

  getUserName(userId: string): string {
    const user = this.userDict[userId];
    return user ? user.name : 'Unknown';
  }
}
