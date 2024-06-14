import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { User } from 'src/model/User';

@Injectable({
  providedIn: 'root'
})
export class GoodlookService {

  constructor(private http: HttpClient) { }

  API_URL : string = 'https://localhost:7234/';

  public getListUser(token: string): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get<any>(`${this.API_URL}api/User/userlist`, { headers })
  }


  public getUserById(id: any, token: string): Observable<User> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get<any>(`${this.API_URL}api/User/getuser?id=${id}`, { headers })
  }

  public deleteUser(id: any, token: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.delete(`${this.API_URL}api/User/deleteUser?userId=${id}`, { headers });
  }

  public createBarber(token: any, formData: FormData): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post<any>(`${this.API_URL}api/Admin/createBarber`, formData, { headers });
  }

  public getBarberList(token: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get<any>(`${this.API_URL}api/Admin/barberList`, { headers });
  }

  public deleteBarber(token: any, email: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.delete(`${this.API_URL}api/Admin/deleteBarber?barberEmail=${email}`, { headers });
  }

  public getDateList(token:any, userId:any) {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get(`${this.API_URL}api/Date/dateList?Id=${userId}`, { headers });
  }

  public createDate(token:any, formData: FormData, barberEmail: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post(`${this.API_URL}api/Date/createDate?barberEmail=${barberEmail}`,formData, { headers });
  }

  public getDate(token:any, barberEmail: any, hour: any, date: any): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.get(`${this.API_URL}api/Date/getDate?barberEmail=${barberEmail}&date=${date}&hour=${hour}`, { headers });
  }

}
