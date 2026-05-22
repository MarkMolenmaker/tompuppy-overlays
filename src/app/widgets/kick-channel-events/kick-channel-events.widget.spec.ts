import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KickChannelEventsWidget } from './kick-channel-events.widget';

describe('KickChannelEvents', () => {
  let component: KickChannelEventsWidget;
  let fixture: ComponentFixture<KickChannelEventsWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KickChannelEventsWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KickChannelEventsWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
