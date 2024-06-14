import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatelistComponent } from './datelist.component';

describe('DatelistComponent', () => {
  let component: DatelistComponent;
  let fixture: ComponentFixture<DatelistComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DatelistComponent]
    });
    fixture = TestBed.createComponent(DatelistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
