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
  date: any;
  myForm: FormGroup;

  token: string | null = localStorage.getItem("JWT") || sessionStorage.getItem('JWT');
  id: string | null = localStorage.getItem("ID") || sessionStorage.getItem('ID');

  constructor(private goodLook: GoodlookService, private formBuilder: FormBuilder) {
    this.myForm = this.formBuilder.group({
      date: ['', Validators.required],
      hour: ['', Validators.required],
      barberId: ['', Validators.required],
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
    } else {
      console.error('No se encontró el token');
    }
  }

  async createDate() {
    const formData = new FormData();
    formData.append('date', this.myForm.get('date')?.value);
    formData.append('hour', this.myForm.get('hour')?.value);
    formData.append('userId', this.id || "");

    this.goodLook.createDate(this.token, formData, this.myForm.get('barberId')).subscribe(
      response => {
        console.log('Cita creada con éxito', response);
      },
      error => {
        console.error('Error al crear la cita', error);
      }
    );

    alert('Registro exitoso.');
  }

  onSubmit() {
    if (this.myForm.valid) {
      this.createDate();
    }
  }

}
