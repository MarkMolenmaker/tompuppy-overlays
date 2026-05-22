/** Base class for kick channel events. */
export class KickChannelEvent {
  chatroomId: number;
  subjectUsername: string;

  constructor(chatroomId: number, subjectUsername: string) {
    this.chatroomId = chatroomId;
    this.subjectUsername = subjectUsername;
  }
}

/** Represents a kick chat subscription event. */
export class KickChannelSubscriptionEvent extends KickChannelEvent {
  months: number;

  constructor(chatroomId: number, subjectUsername: string, months: number) {
    super(chatroomId, subjectUsername);
    this.months = months;
  }
}

/** Represents a kick chat subscription gifted event. */
export class KickChannelSubscriptionGiftedEvent extends KickChannelEvent {
  giftedTotal: number;
  giftedUsernames: Array<string>;
  subjectTotal: number;

  constructor(chatroomId: number, subjectUsername: string, giftedTotal: number, giftedUsernames: Array<string>, subjectTotal: number) {
    super(chatroomId, subjectUsername);
    this.giftedTotal = giftedTotal;
    this.giftedUsernames = giftedUsernames;
    this.subjectTotal = subjectTotal;
  }
}
