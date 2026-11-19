import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { StatusMessage } from '../shared/status-message';
import { Agenda, AgendaApi } from './agenda-api';
import { businessDay, displayDay, displayInstant, mondayOf, shiftDays } from './week';

type State = { kind: 'loading' | 'error' } | { kind: 'ready'; agenda: Agenda };
const appointmentStates: Record<string, string> = { booked: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' };

@Component({
  selector: 'gl-agenda-week',
  imports: [StatusMessage],
  templateUrl: './agenda-week.html',
})
export class AgendaWeek {
  readonly businessId = input.required<string>();
  readonly professionalId = input.required<string>();
  readonly timezone = input.required<string>();
  readonly revision = input(0);
  protected readonly grid = signal(false);
  private readonly api = inject(AgendaApi);
  private readonly offset = signal(0);
  private readonly reload = signal(0);
  protected readonly week = computed(() => shiftDays(mondayOf(businessDay(new Date(), this.timezone())), this.offset() * 7));
  private readonly query = computed(() => ({
    businessId: this.businessId(), professionalId: this.professionalId(), week: this.week(),
    reload: this.reload(), revision: this.revision(),
  }));
  protected readonly state = toSignal(toObservable(this.query).pipe(switchMap(({ businessId, professionalId, week }) =>
    this.api.week(businessId, professionalId, week).pipe(
      map((agenda): State => ({ kind: 'ready', agenda })),
      startWith({ kind: 'loading' } as State),
      catchError(() => of<State>({ kind: 'error' })),
    ),
  )), { initialValue: { kind: 'loading' } as State });
  protected readonly displayDay = displayDay;
  protected readonly displayInstant = displayInstant;
  protected readonly appointmentStates = appointmentStates;

  protected readonly days = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready') return [];
    const { hours, appointments, closures, timezone } = state.agenda;
    return Array.from({ length: 7 }, (_, index) => {
      const day = shiftDays(this.week(), index);
      return {
        day,
        hours: hours.filter(hour => hour.weekday === index + 1),
        appointments: appointments.filter(item => businessDay(item.startAt, timezone) <= day &&
          businessDay(new Date(Date.parse(item.endAt) - 1), timezone) >= day),
        closures: closures.filter(item => businessDay(item.startAt, timezone) <= day &&
          businessDay(new Date(Date.parse(item.endAt) - 1), timezone) >= day),
      };
    });
  });

  protected move(delta: number) { this.offset.update(value => value + delta); }
  protected retry() { this.reload.update(value => value + 1); }
}
