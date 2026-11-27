import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogPreviewPage } from './catalog-preview-page';

function business(id: string) {
  return { id, name: 'Negocio ' + id, timezone: 'Europe/Madrid', sector: 'Estética', address: 'Calle' };
}

describe('Portada del catálogo', () => {
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<CatalogPreviewPage>>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CatalogPreviewPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CatalogPreviewPage);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';

  function button(label: string): HTMLButtonElement {
    const match = Array.from(root().querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === label);
    if (!match) throw new Error('Botón no encontrado: ' + label);
    return match;
  }

  it('no ofrece más páginas si el backend no envía X-Has-More', () => {
    http.expectOne('/api/catalog/businesses').flush([business('a')]);
    fixture.detectChanges();
    expect(text()).toContain('Negocio a');
    expect(root().querySelector('button')?.textContent).not.toContain('Cargar más');
  });

  it('añade la página siguiente, anuncia el resultado y mueve el foco al primer negocio nuevo', async () => {
    http.expectOne('/api/catalog/businesses').flush([business('a')], { headers: { 'X-Has-More': 'true' } });
    fixture.detectChanges();
    expect(text()).toContain('Negocio a');

    button('Cargar más').click();
    fixture.detectChanges();
    expect(text()).toContain('Cargando más negocios');
    expect(button('Cargar más').disabled).toBeTrue();
    expect(root().querySelector('[aria-busy="true"]')).not.toBeNull();

    const next = http.expectOne(item => item.url === '/api/catalog/businesses' && item.params.get('page') === '2');
    expect(next.request.params.get('limit')).toBe('50');
    next.flush([business('b')], { headers: { 'X-Has-More': 'false' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('Negocio a');
    expect(text()).toContain('Negocio b');
    expect(text()).toContain('Se ha añadido 1 negocio');
    expect(document.activeElement?.textContent).toContain('Negocio b');
    expect(root().querySelector('button')?.textContent ?? '').not.toContain('Cargar más');
  });

  it('conserva lo ya listado si falla la página siguiente y permite reintentar', () => {
    http.expectOne('/api/catalog/businesses').flush([business('a')], { headers: { 'X-Has-More': 'true' } });
    fixture.detectChanges();
    button('Cargar más').click();
    http.expectOne(item => item.params.get('page') === '2').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(text()).toContain('Negocio a');
    expect(text()).toContain('No pudimos cargar más negocios');
    expect(button('Cargar más').disabled).toBeFalse();

    button('Cargar más').click();
    http.expectOne(item => item.params.get('page') === '2').flush([business('b')], { headers: { 'X-Has-More': 'false' } });
    fixture.detectChanges();
    expect(text()).toContain('Negocio b');
    expect(text()).not.toContain('No pudimos cargar más negocios');
  });
});
