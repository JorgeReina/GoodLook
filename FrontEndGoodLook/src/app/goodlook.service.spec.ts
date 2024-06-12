import { TestBed } from '@angular/core/testing';

import { GoodlookService } from './goodlook.service';

describe('GoodlookService', () => {
  let service: GoodlookService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GoodlookService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
