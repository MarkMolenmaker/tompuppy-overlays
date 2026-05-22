import { Component, inject, HostListener, signal, computed } from '@angular/core';
import { TKickChannelEventsWidgetConfiguration } from '../../common/widget-configuration';
import { WidgetConfigurationService } from '../../services/widget-configuration.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KickChatroomService } from '../../services/kick-chatroom.service';
import { KickApiService } from '../../services/kick-api.service';
import { firstValueFrom } from 'rxjs';
import {
  KickChannelEvent,
  KickChannelSubscriptionEvent,
  KickChannelSubscriptionGiftedEvent
} from '../../common/kick-channel-events';

@Component({
  selector: 'app-kick-channel-events',
  standalone: true,
  templateUrl: './kick-channel-events.widget.html',
  styleUrl: './kick-channel-events.widget.scss',
  providers: [
    KickChatroomService,
    WidgetConfigurationService,
  ],
})
export class KickChannelEventsWidget {

  // Widget configuration.
  private readonly widgetConfiguration = signal<TKickChannelEventsWidgetConfiguration | null>(null);
  protected get config(): TKickChannelEventsWidgetConfiguration {
    const config = this.widgetConfiguration();
    if (!config) throw new Error('Widget configuration is not initialized');
    return config;
  }

  // Event state and queue management.
  protected readonly kickChannelEvent = signal<KickChannelEvent | null>(null);
  protected readonly eventSubjectProfilePicUrl = signal<string>('');
  private readonly eventQueue = signal<Array<KickChannelEvent>>([]);
  private readonly isPlaying = signal<boolean>(false);

  protected readonly subscriptionGifUrl = signal<string>('');
  protected readonly isGifLoaded = signal<boolean>(false);

  private readonly subscriptionAudio = signal<HTMLAudioElement>(new Audio('assets/audio/subscription.mp3'));
  private readonly subscriptionGiftedAudio = signal<HTMLAudioElement>(new Audio('assets/audio/subscription.mp3'));
  private readonly isAudioPlaying = signal<boolean>(false);

  protected readonly currentEventType = computed<'SUBSCRIPTION' | 'SUBSCRIPTION_GIFTED' | ''>(() => {
    if (this.kickChannelEvent() instanceof KickChannelSubscriptionEvent) return 'SUBSCRIPTION';
    if (this.kickChannelEvent() instanceof KickChannelSubscriptionGiftedEvent) return 'SUBSCRIPTION_GIFTED';
    return '';
  });
  protected readonly subscriptionEvent = computed<KickChannelSubscriptionEvent>(() => this.kickChannelEvent() as KickChannelSubscriptionEvent);
  protected readonly subscriptionGiftedEvent = computed<KickChannelSubscriptionGiftedEvent>(() => this.kickChannelEvent() as KickChannelSubscriptionGiftedEvent);

  // Service injections.
  private readonly kickChatroomService: KickChatroomService = inject(KickChatroomService);
  private readonly widgetConfigurationService: WidgetConfigurationService<TKickChannelEventsWidgetConfiguration> = inject(WidgetConfigurationService);
  private readonly kickApiService: KickApiService = inject(KickApiService);

  constructor() {
    this.widgetConfiguration.set(this.widgetConfigurationService.getWidgetConfiguration());

    // Subscribe to the kick chatroom service to receive subscription events.
    this.kickChatroomService.onKickChannelEvent
      .pipe(takeUntilDestroyed())
      .subscribe((subscription: KickChannelEvent) => this.handleKickChatSubscription(subscription));
  }

  // TODO: DEBUG ONLY
  @HostListener('window:keydown.space', ['$event'])
  handleSpaceKey(event: Event) {
    event.preventDefault();
    const testSubscription = new KickChannelSubscriptionEvent(0, 'inazumark', 1);
    this.handleKickChatSubscription(testSubscription);
  }
  @HostListener('window:keydown.enter', ['$event'])
  handleEnterKey(event: Event) {
    event.preventDefault();
    const testSubscription = new KickChannelSubscriptionGiftedEvent(0, 'inazumark', 5, ['inazumark', 'inazumark2'], 10);
    this.handleKickChatSubscription(testSubscription);
  }
  // TODO: DEBUG ONLY

  private handleKickChatSubscription(subscription: KickChannelEvent) {
    this.eventQueue().push(subscription);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isPlaying() || this.eventQueue().length === 0) {
      console.debug('Queue is already playing or empty, skipping');
      return;
    }

    // Get the first event from the queue.
    const event = this.eventQueue().shift() || null;
    if (event) {
      this.isPlaying.set(true);   // Block any new events from being processed until the current one is finished.

      // Attempt to find the profile picture for the user.
      try {
        const profilePicture = await firstValueFrom(this.kickApiService.getProfilePictureUrl(event.subjectUsername));
        this.eventSubjectProfilePicUrl.set(profilePicture);
      } catch (error) {
        console.error('Failed to fetch profile picture:', error);
        this.eventSubjectProfilePicUrl.set('');
      }

      // Prepare Native Browser TTS
      let ttsTimeoutId: ReturnType<typeof setTimeout> | null = null;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        ttsTimeoutId = setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(`${event.subjectUsername}`);
          utterance.volume = this.config.audioTTSVolume;
          utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
        }, 6000);
      } else {
        console.warn('Text-to-Speech is not supported in this browser.');
      }

      // Preload and reset GIF animation.
      this.isGifLoaded.set(false);

      try {
        const gifUrl = await this.preloadGif('assets/gifs/subscription.gif');
        this.subscriptionGifUrl.set(gifUrl);
        this.isGifLoaded.set(true);
      } catch (error) {
        console.error('Failed to preload gif', error);
      }

      // Show the event only after GIF is loaded.
      this.kickChannelEvent.set(event);

      // Call the appropriate handler based on the event type.
      if (event instanceof KickChannelSubscriptionEvent) {
        await this.playSubscriptionEventAudio();
        await this.delay(this.config.subscriptionEventDurationMS);
      } else if (event instanceof KickChannelSubscriptionGiftedEvent) {
        await this.playSubscriptionGiftedEventAudio();
        await this.delay(this.config.subscriptionGiftedEventDurationMS);
      }

      // Reset and hide.
      this.kickChannelEvent.set(null);
      this.eventSubjectProfilePicUrl.set('');
      this.subscriptionGifUrl.set('');
      this.isGifLoaded.set(false);
      this.stopAudio();
      if (ttsTimeoutId) clearTimeout(ttsTimeoutId);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      await this.delay(500);

      this.isPlaying.set(false);  // Allow new events to be processed.
    }

    // Process the next event in the queue.
    this.processQueue();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async preloadGif(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cacheBustUrl = `${path}?t=${Date.now()}`;

      const img = new Image();

      img.onload = () => resolve(cacheBustUrl);
      img.onerror = reject;

      img.src = cacheBustUrl;
    });
  }

  private async playSubscriptionEventAudio(): Promise<void> {
    try {
      if (!this.isAudioPlaying()) this.isAudioPlaying.set(true);
      this.subscriptionAudio().volume = this.config.audioVolume;
      await this.subscriptionAudio().play();
    } catch {
      console.error('Failed to play subscription event audio');
    }
  }

  private async playSubscriptionGiftedEventAudio(): Promise<void> {
    try {
      if (!this.isAudioPlaying()) this.isAudioPlaying.set(true);
      this.subscriptionGiftedAudio().volume = this.config.audioVolume;
      await this.subscriptionGiftedAudio().play();
    } catch {
      console.error('Failed to play subscription gifted event audio');
    }
  }

  private stopAudio(): void {
    this.subscriptionAudio().pause();
    this.subscriptionAudio().currentTime = 0;

    this.subscriptionGiftedAudio().pause();
    this.subscriptionGiftedAudio().currentTime = 0;

    this.isAudioPlaying.set(false);
  }
}
