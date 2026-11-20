import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionService } from '../session.service';
import { AgendaWeek } from './agenda-week';

@Component({
  imports: [AgendaWeek],
  template: `
    <h1 tabindex="-1">Mi agenda</h1>
    <label for="agenda-business">Negocio</label>
    <select id="agenda-business" #select (change)="selected.set(select.value)">
      @for (item of memberships(); track item.businessId) {
        <option [value]="item.businessId" [selected]="item.businessId === current()?.businessId">{{ item.businessName }}</option>
      }
    </select>
    @if (current(); as item) {
      @if (item.professionalId; as professionalId) {
        <gl-agenda-week [businessId]="item.businessId" [professionalId]="professionalId" [timezone]="item.timezone" />
      }
    }
  `,
})
export class WeeklyAgendaPage {
  protected readonly memberships = inject(SessionService).agendaMemberships;
  protected readonly selected = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('negocio'));
  protected readonly current = computed(() => this.memberships().find(item => item.businessId === this.selected()) ?? this.memberships()[0]);
}
