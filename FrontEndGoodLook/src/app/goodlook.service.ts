import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { User } from 'src/model/User';

@Injectable({
  providedIn: 'root'
})
export class GoodlookService {

  constructor(private http: HttpClient) { }

  API_URL : string = 'https://localhost:7234/';

  public getListUser() {
    
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
