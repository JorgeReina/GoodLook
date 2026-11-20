import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from './session.service';

const protectSpace: CanActivateFn = (route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const space = route.data['space'];
  const business = route.queryParamMap.getAll('negocio');
  const professional = route.queryParamMap.getAll('profesional');

  return session.ensure().pipe(map(({ status }) => {
    const queryParams = { retorno: state.url };
    if (status === 'unavailable') {
      return router.createUrlTree(['/sesion-no-disponible'], { queryParams });
    }
    if (status !== 'active') return router.createUrlTree(['/acceso'], { queryParams });
    if (space === 'customer') return true;
    if (space === 'management' && route.queryParamMap.get('alta') === '1' && !business.length && !professional.length) return true;

    const memberships = space === 'agenda' ? session.agendaMemberships() : session.managementMemberships();
    const authorized = business.length <= 1 && professional.length <= 1 && memberships.some(membership =>
      (!business.length || membership.businessId === business[0]) &&
      (space !== 'agenda' || !professional.length || membership.professionalId === professional[0]),
    );
    return authorized || router.createUrlTree(['/sin-acceso']);
  }));
};

const notice = () => import('./shared/notice-page').then(module => module.NoticePage);

export const productRoutes: Routes = [
  { path: '', pathMatch: 'full', title: 'GoodLook · Catálogo', loadComponent: () => import('./catalog-preview-page').then(module => module.CatalogPreviewPage) },
  { path: 'piloto', pathMatch: 'full', redirectTo: '' },
  { path: 'negocios/:id', title: 'GoodLook · Negocio', loadComponent: () => import('./customer/business-page').then(module => module.BusinessPage) },
  { path: 'reservar/:id', title: 'GoodLook · Reservar', loadComponent: () => import('./customer/booking-page').then(module => module.BookingPage) },
  { path: 'acceso', title: 'GoodLook · Acceso', loadComponent: () => import('./access/access-page').then(module => module.AccessPage) },
  {
    path: 'mis-citas', title: 'GoodLook · Mis citas', canActivate: [protectSpace], data: { space: 'customer' },
    loadComponent: () => import('./customer/my-bookings-page').then(module => module.MyBookingsPage),
  },
  {
    path: 'mi-agenda', title: 'GoodLook · Mi agenda', loadComponent: () => import('./agenda/weekly-agenda-page').then(module => module.WeeklyAgendaPage), canActivate: [protectSpace],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange', data: { heading: 'Mi agenda', space: 'agenda' },
  },
  {
    path: 'gestion', title: 'GoodLook · Gestión', loadComponent: () => import('./management/management-page').then(module => module.ManagementPage), canActivate: [protectSpace],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange', data: { heading: 'Gestión', space: 'management' },
  },
  { path: 'invitacion', title: 'GoodLook · Invitación', loadComponent: () => import('./management/invitation-page').then(module => module.InvitationPage) },
  {
    path: 'sesion-no-disponible', title: 'GoodLook · Sesión no disponible', loadComponent: notice,
    data: { heading: 'No pudimos comprobar tu sesión', message: 'Vuelve a intentarlo cuando tengas conexión.', retry: true },
  },
  {
    path: 'sin-acceso', title: 'GoodLook · Acceso restringido', loadComponent: notice,
    data: { heading: 'Acceso restringido', message: 'Tu cuenta no tiene acceso a este espacio.' },
  },
  {
    path: '**', title: 'GoodLook · Página no encontrada', loadComponent: notice,
    data: { heading: 'Página no encontrada', message: 'Comprueba la dirección o vuelve al catálogo.' },
  },
];
