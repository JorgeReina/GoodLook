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

    return this.http.get<any>(`${this.API_URL}api/User/userlist`, {headers})
  }

  public signUser(user: User): Observable<string> {

    const name = "Jorge";
    const email = "ejemplo@ejemplo.com"
    const password = "1234"

    const user2 = {
      name: name,
      email: email,
      password: password
    };

    return this.http.post<string>(`${this.API_URL}api/User/signup`, user2);
  }
}
