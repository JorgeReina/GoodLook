import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { GoodlookService } from '../goodlook.service';
import { User } from 'src/model/User';

@Component({
  selector: 'app-calendar2',
  templateUrl: './calendar2.component.html',
  styleUrls: ['./calendar2.component.css']
})
export class Calendar2Component implements OnInit {

  data!: User;
  myForm: FormGroup;

  date: any;
  hour: any;
  

  barberList: any[] = [];

  token: string | null = localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  constructor(private goodLook: GoodlookService, private formBuilder: FormBuilder) {
    this.myForm = this.formBuilder.group({
      date: ['', Validators.required],
      hour: ['12:00', Validators.required],
      barberEmail: ['', Validators.required],
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
    }
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

  async createDate() {
    const formData = new FormData();
    formData.append('date', this.myForm.get('date')?.value);
    formData.append('hour', this.myForm.get('hour')?.value);
    formData.append('userId', this.id || "");

    let date = this.myForm.get('date')?.value;
    let hour = this.myForm.get('hour')?.value
    let barberEmail = this.myForm.get('barberEmail')?.value

    let busyDate: boolean;

    this.goodLook.getDate(this.token, barberEmail, hour, date).subscribe(
      response => {
        busyDate = response;
        console.log(busyDate)
        
        if (busyDate) {
          this.goodLook.createDate(this.token, formData, barberEmail).subscribe(
            response => {
              console.log('Cita creada con éxito', response);
              alert('Successful reserved haircut');
            },
            error => {
              console.error('Error al crear la cita', error);
            }
          );
        } else{
          alert('This date is reserved')
        }
      }
    ) 
  }

  onSubmit() {
    if (this.myForm.valid) {
      this.createDate();
    }
  }

}
