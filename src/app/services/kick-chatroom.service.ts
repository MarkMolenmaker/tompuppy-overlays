import { inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subject } from 'rxjs';
import { WidgetConfigurationService } from './widget-configuration.service';
import { TWidgetConfiguration } from '../common/widget-configuration';
import {
  KickChannelEvent,
  KickChannelSubscriptionEvent,
  KickChannelSubscriptionGiftedEvent
} from '../common/kick-channel-events';

// Type for a Kick Chat message.
export type KickChatMessage = {
  id: string;
  chatroom_id: number;
  content: string;
  type: string;
  created_at: string;
  sender: KickChatMessageSender;
  metadata: {
    message_ref: string;
  };
}

export type KickChatMessageSender = {
  id: number;
  username: string;
  slug: string;
  identity: {
    color: string;
    badges: Array<{
      type: string;
      text: string;
    }>;
  };
}

// Wrapper for a Kick Chat message as a command.
export type KickChatCommand = {
  command: string;
  arguments: Array<string>;
  senderIsAdmin: boolean;
  message: KickChatMessage;
}

// Type for a Kick Chat subscription.
export type SubscriptionEventData = {
  chatroom_id: number;
  months: number;
  username: string;
}

// Type for a Kick Chat subscription gifted.
export type SubscriptionGiftedEventData = {
  chatroom_id: number;
  gifted_usernames: Array<string>;
  gifter_username: string;
  gifted_total: number;
  gifter_total: number;
  chunk_details: null;
}

// Constants.
const WS_URL = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';
const WS_PING_INTERVAL_MS = 60_000;
const PING_MESSAGE = JSON.stringify({ event: 'pusher:ping', data: '{}' });

@Injectable()
export class KickChatroomService {

  // Websocket connection state.
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private context: TWidgetConfiguration | null = null

  // Event for emitting received messages to the injectors.
  readonly onKickChatMessage = new Subject<KickChatMessage>();
  readonly onKickChatCommand = new Subject<KickChatCommand>();
  readonly onKickChannelEvent = new Subject<KickChannelEvent>();
  readonly onKickChatPong = new Subject<void>();

  // Map with unique senders.
  private readonly kickChatProfiles = new Map<number, KickChatMessageSender>();

  // Service injections.
  private readonly router: Router = inject(Router);
  private readonly widgetConfigurationService: WidgetConfigurationService<TWidgetConfiguration> = inject(WidgetConfigurationService);

  constructor() {
    this.context = this.widgetConfigurationService.getWidgetConfiguration();

    // When the navigation changes, try to connect to the websocket.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.attemptConnection());
  }

  /**
   * Returns true if the given user is an admin.
   *
   * @param slug The user's slug.
   * @returns True if the user is an admin.
   */
  public isAdminUser(slug: string): boolean {
    if (!this.context) return false;
    return this.context.admin.includes(slug);
  }

  /**
   * Retrieves the kick chat profile associated with the given ID.
   *
   * @param {number} id - The unique identifier for the kick chat profile.
   * @return {KickChatMessageSender | undefined} The kick chat profile if found, otherwise undefined.
   */
  public getKickChatProfile(id: number): KickChatMessageSender | undefined {
    return this.kickChatProfiles.get(id);
  }

  private attemptConnection(): void {
    if (this.connected) return;
    this.connect();     // Attempt to connect.
  }

  private connect(): void {
    const context = this.context;
    if (this.connected) return; // Don't connect twice.
    if (!context) return;       // Only connect if we have a context.

    this.socket = new WebSocket(WS_URL);

    // 3 event listeners: open, message, close
    this.socket.addEventListener('open', (event) => this.onOpen(event, context));
    this.socket.addEventListener('message', (event) => this.onMessage(event, context));
    this.socket.addEventListener('close', (event) => this.onClose(event, context));

    this.connected = true;
  }

  private onOpen(_event: Event, context: TWidgetConfiguration): void {
    this.startPing();
    this.subscribe(context);
  }

  private onMessage(event: MessageEvent, _context: TWidgetConfiguration): void {
    const rawEvent: string = event.data;
    const jsonEvent = JSON.parse(rawEvent);
    switch (jsonEvent.event) {

      case 'App\\Events\\ChatMessageEvent':
        const rawData: string = jsonEvent.data;
        const data = JSON.parse(rawData) as KickChatMessage;

        // Store the sender.
        this.kickChatProfiles.set(data.sender.id, data.sender);

        // Emit the raw message to the injectors.
        this.onKickChatMessage.next(data);

        // Check if the message is a command. If so, emit it to the injectors.
        if (data.content.startsWith('!')) {
          const command = data.content.split(' ')[0].substring(1);
          const args = data.content.split(' ').slice(1);
          this.onKickChatCommand.next({ command, arguments: args, message: data, senderIsAdmin: this.isAdminUser(data.sender.slug) });
        }
        break;

      case 'App\\Events\\SubscriptionEvent':
        const rawSubscriptionEventData: string = jsonEvent.data;
        const subscriptionEventData = JSON.parse(rawSubscriptionEventData) as SubscriptionEventData;

        // Emit the event to the injectors.
        this.onKickChannelEvent.next(
          new KickChannelSubscriptionEvent(
            subscriptionEventData.chatroom_id,
            subscriptionEventData.username,
            subscriptionEventData.months
          )
        );
        break;

      case 'GiftedSubscriptionsEvent':
        const rawSubscriptionGiftedEventData: string = jsonEvent.data;
        const subscriptionGiftedEventData = JSON.parse(rawSubscriptionGiftedEventData) as SubscriptionGiftedEventData;

        // Emit the event to the injectors.
        this.onKickChannelEvent.next(
          new KickChannelSubscriptionGiftedEvent(
            subscriptionGiftedEventData.chatroom_id,
            subscriptionGiftedEventData.gifter_username,
            subscriptionGiftedEventData.gifted_total,
            subscriptionGiftedEventData.gifted_usernames,
            subscriptionGiftedEventData.gifter_total
          )
        );
        break;

      case 'pusher:pong':
        this.onKickChatPong.next();
        break;

      default:
        console.warn(`Unknown event: ${jsonEvent.event}`);
    }
  }

  private onClose(_event: CloseEvent, _ctx: TWidgetConfiguration): void {
    this.stopPing();
    this.socket = null;
    this.connected = false;

    // Try to reconnect after a short delay.
    setTimeout(() => this.connect(), 1000);
  }

  private subscribe(ctx: TWidgetConfiguration): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // Subscribe to chatrooms.x.v2 channel.
    this.socket.send(JSON.stringify({
      event: "pusher:subscribe",
      data: {
        auth: "",
        channel: `chatrooms.${ctx.chatroomId}.v2`
      }
    }));

    // Subscribe to chatroom_x channel.
    this.socket.send(JSON.stringify({
      event: "pusher:subscribe",
      data: {
        auth: "",
        channel: `chatroom_${ctx.chatroomId}`
      }
    }))
  }

  private startPing(): void {
    if (!this.socket) return;
    if (this.pingTimer) return;

    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(PING_MESSAGE);
    }, WS_PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
// >>> FIRST TIME SUBS ------ App\\Events\\SubscriptionEvent
// {"event":"App\\Events\\SubscriptionEvent","data":"{\"chatroom_id\":715,\"username\":\"gabcit89\",\"months\":1}","channel":"chatrooms.715.v2"}
//
// {"event":"App\\Events\\ChannelSubscriptionEvent","data":"{\"user_ids\":[52689656],\"username\":\"harleydagoat\",\"channel_id\":715}","channel":"channel.715"}
// {"event":"App\\Events\\ChatMessageSentEvent","data":"{\"message\":{\"id\":\"2f6081f9-d4e1-447c-adcf-af12801dbc03\",\"message\":null,\"type\":\"info\",\"replied_to\":null,\"is_info\":null,\"link_preview\":null,\"chatroom_id\":715,\"role\":\"user\",\"created_at\":1779434075,\"action\":\"subscribe\",\"optional_message\":null,\"months_subscribed\":1,\"subscriptions_count\":0,\"giftedUsers\":null},\"user\":{\"id\":52689656,\"username\":\"harleydagoat\",\"role\":\"user\",\"isSuperAdmin\":null,\"profile_thumb\":null,\"verified\":false,\"follower_badges\":[],\"is_subscribed\":null,\"is_founder\":false,\"months_subscribed\":1,\"quantity_gifted\":0}}","channel":"chatrooms.715"}
// {"event":"App\\Events\\SubscriptionEvent","data":"{\"chatroom_id\":715,\"username\":\"harleydagoat\",\"months\":1}","channel":"chatrooms.715.v2"}
//

// >>> SUB GIFTS ------ GiftedSubscriptionsEvent
// {"event":"GiftedSubscriptionsEvent","data":"{\"chatroom_id\":715,\"gifted_usernames\":[\"pokerrolex\",\"fukinjuan\",\"EvilNero\",\"Monkey_Toes219\",\"Turkii13\"],\"gifter_username\":\"Bagginsss\",\"gifted_total\":5,\"gifter_total\":5,\"chunk_details\":null}","channel":"chatroom_715"}
//
// {"event":"GiftedSubscriptionsEvent","data":"{\"chatroom_id\":715,\"gifted_usernames\":[\"konrad_xiii\",\"snowflake3344\",\"jiCpfAN\",\"nachitosalsench\",\"HalfEvilSam\",\"Warworm1234\",\"Lucasean\",\"dedison2\",\"SaucedUp904\",\"thulky72007\",\"shmeetv\",\"threetonsogre\",\"speeda2\",\"Xysh\",\"icustinky\",\"Matt_523\",\"BlakeCarlascio\",\"Panthe11\",\"BasedJaky\",\"saucyyyyy\",\"letauqnidip\",\"giovan86\",\"Huapug\",\"droollz\",\"coobieboy\",\"StrongDabs420\",\"Qciki\",\"Phillolx\",\"Lolbit682\",\"NIKO_LAW\",\"ModernPeasantt\",\"kennethwalt\",\"SIN990\",\"Sinaloa1994\",\"qwxy\",\"PAINTED\",\"LurenzoBiello\",\"brazil420\",\"sun_ra\",\"000000000000000000000000y\",\"JujharThind\",\"fpsolution001\",\"Ziimxeyik\",\"leejay14\",\"larz2001\",\"Xubub\",\"Abelambriz9\",\"Giyanimeegig\",\"NIVEDTHEBALDKING\",\"g60st\",\"AlejandroxL\",\"Twistud\",\"xutigital\",\"Googlymoogl\",\"Fetsluck24\",\"Krato\",\"Todri1\",\"hromaihgn\",\"itssasiaaaa\",\"tissmajr\",\"2pretty2paid\",\"bahmai\",\"opilex\",\"iwmmm\",\"DJMASTERZ29\",\"Tresta\",\"Chuletita\",\"ifhy\",\"MaseCobraah\",\"Opsyy0\",\"Elraenfan19\",\"checksoverstripes248\",\"Cisnsbsk\",\"champagneroger\",\"liltk6\",\"Bidness\",\"Flowwolley\",\"MichuXxX321\",\"Nico12341\",\"19199191\",\"BrenMusic\",\"WildAndFreeKristaIBe\",\"Therichjunkie\",\"Naigouzzi\",\"ManiacMalice\",\"ultraskeppy\",\"Nando1204\",\"von0\",\"OLG1M\",\"JanCPR\",\"billyemartin57\",\"Jotabragga\",\"CAVsQcQKJB\",\"Thewakemaker\",\"Jaytocxmp97\",\"Rjbrock3\",\"Yankove\",\"Onetrick19\",\"egirlsocks\",\"sowup\"],\"gifter_username\":\"Jelitics\",\"gifted_total\":100,\"gifter_total\":100,\"chunk_details\":null}","channel":"chatroom_715"}
// {"event":"App\\Events\\ChannelSubscriptionEvent","data":"{\"user_ids\":[2067143,17635,2067893,2068181,19291292,21037766,2383745,2059126,1166725,2679747,26423709,63862692,2866511,5689207,23295,2059869,29222032,10722897,2063776,1190456,1915194,2064920,2383643,8883867,26412322,2059355,2059536,75357,2061250,2059271,2065178,2068652,2065539,2065491,2070007,2073395,2073840,6828777,15861816,2389726,21435655,3275434,19357301,2384027,60127363,4586261,25504523,3399376,2064471,48043511,2061732,2070316,1069464,2059145,1453139,2284987,1597244,103275004,79095486,7460752,18830204,20000944,1899776,19825076,859352,26391513,30374,4911518,51468,7414419,5463,31866891,46390540,18126064,102189795,64012,62577931,17640918,74652717,257473,84726803,71147365,77742095,84558769,79097064,87316104,92616689,94082912,918959,78433524,102242994,76488264,102173782,103275582,27992733,162496,106991354,71479,107136756,107866864],\"username\":\"\",\"channel_id\":715}","channel":"channel.715"}
// {"event":"App\\Events\\ChatMessageSentEvent","data":"{\"message\":{\"id\":\"44bb428f-9e68-436f-9d9e-888a3753a9b2\",\"message\":null,\"type\":\"info\",\"replied_to\":null,\"is_info\":null,\"link_preview\":null,\"chatroom_id\":715,\"role\":\"user\",\"created_at\":1779433405,\"action\":\"gift\",\"optional_message\":null,\"months_subscribed\":null,\"subscriptions_count\":100,\"giftedUsers\":[{\"username\":\"Lolbit682\",\"monthsSubscribed\":1},{\"username\":\"dedison2\",\"monthsSubscribed\":1},{\"username\":\"BasedJaky\",\"monthsSubscribed\":1},{\"username\":\"JujharThind\",\"monthsSubscribed\":1},{\"username\":\"jiCpfAN\",\"monthsSubscribed\":1},{\"username\":\"snowflake3344\",\"monthsSubscribed\":1},{\"username\":\"AlejandroxL\",\"monthsSubscribed\":1},{\"username\":\"Googlymoogl\",\"monthsSubscribed\":1},{\"username\":\"2pretty2paid\",\"monthsSubscribed\":1},{\"username\":\"Todri1\",\"monthsSubscribed\":1},{\"username\":\"bahmai\",\"monthsSubscribed\":1},{\"username\":\"xutigital\",\"monthsSubscribed\":1},{\"username\":\"Fetsluck24\",\"monthsSubscribed\":1},{\"username\":\"tissmajr\",\"monthsSubscribed\":1},{\"username\":\"hromaihgn\",\"monthsSubscribed\":1},{\"username\":\"opilex\",\"monthsSubscribed\":1},{\"username\":\"Elraenfan19\",\"monthsSubscribed\":1},{\"username\":\"iwmmm\",\"monthsSubscribed\":1},{\"username\":\"Twistud\",\"monthsSubscribed\":1},{\"username\":\"itssasiaaaa\",\"monthsSubscribed\":1},{\"username\":\"DJMASTERZ29\",\"monthsSubscribed\":1},{\"username\":\"Krato\",\"monthsSubscribed\":1},{\"username\":\"ManiacMalice\",\"monthsSubscribed\":1},{\"username\":\"Naigouzzi\",\"monthsSubscribed\":1},{\"username\":\"MichuXxX321\",\"monthsSubscribed\":1},{\"username\":\"Chuletita\",\"monthsSubscribed\":1},{\"username\":\"ultraskeppy\",\"monthsSubscribed\":1},{\"username\":\"ifhy\",\"monthsSubscribed\":1},{\"username\":\"MaseCobraah\",\"monthsSubscribed\":1},{\"username\":\"Opsyy0\",\"monthsSubscribed\":1},{\"username\":\"Tresta\",\"monthsSubscribed\":1},{\"username\":\"Nico12341\",\"monthsSubscribed\":1},{\"username\":\"Flowwolley\",\"monthsSubscribed\":1},{\"username\":\"checksoverstripes248\",\"monthsSubscribed\":1},{\"username\":\"BrenMusic\",\"monthsSubscribed\":1},{\"username\":\"Therichjunkie\",\"monthsSubscribed\":1},{\"username\":\"Bidness\",\"monthsSubscribed\":1},{\"username\":\"Cisnsbsk\",\"monthsSubscribed\":1},{\"username\":\"19199191\",\"monthsSubscribed\":1},{\"username\":\"JanCPR\",\"monthsSubscribed\":1},{\"username\":\"CAVsQcQKJB\",\"monthsSubscribed\":1},{\"username\":\"WildAndFreeKristaIBe\",\"monthsSubscribed\":1},{\"username\":\"billyemartin57\",\"monthsSubscribed\":1},{\"username\":\"Onetrick19\",\"monthsSubscribed\":1},{\"username\":\"OLG1M\",\"monthsSubscribed\":1},{\"username\":\"Nando1204\",\"monthsSubscribed\":1},{\"username\":\"von0\",\"monthsSubscribed\":1},{\"username\":\"champagneroger\",\"monthsSubscribed\":1},{\"username\":\"liltk6\",\"monthsSubscribed\":1},{\"username\":\"Yankove\",\"monthsSubscribed\":1},{\"username\":\"sowup\",\"monthsSubscribed\":1},{\"username\":\"egirlsocks\",\"monthsSubscribed\":1},{\"username\":\"Rjbrock3\",\"monthsSubscribed\":1},{\"username\":\"Thewakemaker\",\"monthsSubscribed\":1},{\"username\":\"Jaytocxmp97\",\"monthsSubscribed\":1},{\"username\":\"Jotabragga\",\"monthsSubscribed\":1},{\"username\":\"saucyyyyy\",\"monthsSubscribed\":1},{\"username\":\"Huapug\",\"monthsSubscribed\":1},{\"username\":\"Phillolx\",\"monthsSubscribed\":1},{\"username\":\"Lucasean\",\"monthsSubscribed\":1},{\"username\":\"g60st\",\"monthsSubscribed\":1},{\"username\":\"speeda2\",\"monthsSubscribed\":1},{\"username\":\"larz2001\",\"monthsSubscribed\":1},{\"username\":\"droollz\",\"monthsSubscribed\":1},{\"username\":\"000000000000000000000000y\",\"monthsSubscribed\":1},{\"username\":\"leejay14\",\"monthsSubscribed\":1},{\"username\":\"coobieboy\",\"monthsSubscribed\":1},{\"username\":\"Panthe11\",\"monthsSubscribed\":1},{\"username\":\"icustinky\",\"monthsSubscribed\":1},{\"username\":\"Warworm1234\",\"monthsSubscribed\":1},{\"username\":\"giovan86\",\"monthsSubscribed\":1},{\"username\":\"nachitosalsench\",\"monthsSubscribed\":1},{\"username\":\"Xysh\",\"monthsSubscribed\":1},{\"username\":\"qwxy\",\"monthsSubscribed\":1},{\"username\":\"Giyanimeegig\",\"monthsSubscribed\":1},{\"username\":\"sun_ra\",\"monthsSubscribed\":1},{\"username\":\"BlakeCarlascio\",\"monthsSubscribed\":1},{\"username\":\"SaucedUp904\",\"monthsSubscribed\":1},{\"username\":\"HalfEvilSam\",\"monthsSubscribed\":1},{\"username\":\"konrad_xiii\",\"monthsSubscribed\":1},{\"username\":\"fpsolution001\",\"monthsSubscribed\":1},{\"username\":\"NIKO_LAW\",\"monthsSubscribed\":1},{\"username\":\"Matt_523\",\"monthsSubscribed\":1},{\"username\":\"Abelambriz9\",\"monthsSubscribed\":1},{\"username\":\"ModernPeasantt\",\"monthsSubscribed\":1},{\"username\":\"kennethwalt\",\"monthsSubscribed\":1},{\"username\":\"SIN990\",\"monthsSubscribed\":1},{\"username\":\"LurenzoBiello\",\"monthsSubscribed\":1},{\"username\":\"StrongDabs420\",\"monthsSubscribed\":1},{\"username\":\"thulky72007\",\"monthsSubscribed\":1},{\"username\":\"Qciki\",\"monthsSubscribed\":1},{\"username\":\"shmeetv\",\"monthsSubscribed\":1},{\"username\":\"Ziimxeyik\",\"monthsSubscribed\":1},{\"username\":\"letauqnidip\",\"monthsSubscribed\":1},{\"username\":\"Xubub\",\"monthsSubscribed\":1},{\"username\":\"NIVEDTHEBALDKING\",\"monthsSubscribed\":1},{\"username\":\"threetonsogre\",\"monthsSubscribed\":1},{\"username\":\"PAINTED\",\"monthsSubscribed\":1},{\"username\":\"Sinaloa1994\",\"monthsSubscribed\":1},{\"username\":\"brazil420\",\"monthsSubscribed\":1}]},\"user\":{\"id\":4397726,\"username\":\"Jelitics\",\"role\":\"user\",\"isSuperAdmin\":null,\"profile_thumb\":\"https:\\/\\/kick-files-prod.s3.us-west-2.amazonaws.com\\/images\\/user\\/4397726\\/profile_image\\/conversion\\/6da67342-73a2-469c-91fb-903b9602c1d1-thumb.webp?X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAS3MDRZGPKNHGJGNE%2F20260522%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260522T070325Z&X-Amz-SignedHeaders=host&X-Amz-Expires=300&X-Amz-Signature=3f67e96e0ec6fd0ba58a5e4adc75f22db20c98d88e27a0a5ec177eb0d7853515\",\"verified\":false,\"follower_badges\":[],\"is_subscribed\":null,\"is_founder\":false,\"months_subscribed\":null,\"quantity_gifted\":0}}","channel":"chatrooms.715"}
// {"event":"App\\Events\\LuckyUsersWhoGotGiftSubscriptionsEvent","data":"{\"channel\":{\"id\":715,\"user_id\":723,\"slug\":\"trainwreckstv\",\"is_banned\":false,\"playback_url\":\"https:\\/\\/fa723fc1b171.us-west-2.playback.live-video.net\\/api\\/video\\/v1\\/us-west-2.196233775518.channel.p0mBRipm9p81.m3u8\",\"name_updated_at\":null,\"vod_enabled\":true,\"subscription_enabled\":true,\"is_affiliate\":false,\"can_host\":true,\"chatroom\":{\"id\":715,\"chatable_type\":\"App\\\\Models\\\\Channel\",\"channel_id\":715,\"created_at\":\"2022-10-22T11:37:24.000000Z\",\"updated_at\":\"2026-01-01T12:43:16.000000Z\",\"chat_mode_old\":\"public\",\"chat_mode\":\"followers_only\",\"slow_mode\":true,\"chatable_id\":715,\"followers_mode\":true,\"subscribers_mode\":false,\"emotes_mode\":false,\"message_interval\":3,\"following_min_duration\":1440}},\"usernames\":[\"Lolbit682\",\"dedison2\",\"BasedJaky\",\"JujharThind\",\"jiCpfAN\",\"snowflake3344\",\"AlejandroxL\",\"Googlymoogl\",\"2pretty2paid\",\"Todri1\",\"bahmai\",\"xutigital\",\"Fetsluck24\",\"tissmajr\",\"hromaihgn\",\"opilex\",\"Elraenfan19\",\"iwmmm\",\"Twistud\",\"itssasiaaaa\",\"DJMASTERZ29\",\"Krato\",\"ManiacMalice\",\"Naigouzzi\",\"MichuXxX321\",\"Chuletita\",\"ultraskeppy\",\"ifhy\",\"MaseCobraah\",\"Opsyy0\",\"Tresta\",\"Nico12341\",\"Flowwolley\",\"checksoverstripes248\",\"BrenMusic\",\"Therichjunkie\",\"Bidness\",\"Cisnsbsk\",\"19199191\",\"JanCPR\",\"CAVsQcQKJB\",\"WildAndFreeKristaIBe\",\"billyemartin57\",\"Onetrick19\",\"OLG1M\",\"Nando1204\",\"von0\",\"champagneroger\",\"liltk6\",\"Yankove\",\"sowup\",\"egirlsocks\",\"Rjbrock3\",\"Thewakemaker\",\"Jaytocxmp97\",\"Jotabragga\",\"saucyyyyy\",\"Huapug\",\"Phillolx\",\"Lucasean\",\"g60st\",\"speeda2\",\"larz2001\",\"droollz\",\"000000000000000000000000y\",\"leejay14\",\"coobieboy\",\"Panthe11\",\"icustinky\",\"Warworm1234\",\"giovan86\",\"nachitosalsench\",\"Xysh\",\"qwxy\",\"Giyanimeegig\",\"sun_ra\",\"BlakeCarlascio\",\"SaucedUp904\",\"HalfEvilSam\",\"konrad_xiii\",\"fpsolution001\",\"NIKO_LAW\",\"Matt_523\",\"Abelambriz9\",\"ModernPeasantt\",\"kennethwalt\",\"SIN990\",\"LurenzoBiello\",\"StrongDabs420\",\"thulky72007\",\"Qciki\",\"shmeetv\",\"Ziimxeyik\",\"letauqnidip\",\"Xubub\",\"NIVEDTHEBALDKING\",\"threetonsogre\",\"PAINTED\",\"Sinaloa1994\",\"brazil420\"],\"gifter_username\":\"Jelitics\"}","channel":"channel.715"}
//
