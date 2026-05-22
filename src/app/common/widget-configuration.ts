import { Params } from '@angular/router';

// --- Base Types ---
/** Generic configuration for a widget. Required for all widgets to work. */
export type TWidgetConfiguration = {
  chatroomId: number;
  admin: Array<string>;
}

// --- Kick Channel Event Types ---
/** Configuration for the kick channel events widget. */
export type TKickChannelEventsWidgetConfiguration = TWidgetConfiguration & {
  audioVolume: number;
  audioTTSVolume: number;
  subscriptionEventDurationMS: number;
  subscriptionGiftedEventDurationMS: number;
}

const DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_AUDIO_VOLUME = 0.5;
const DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_TTS_AUDIO_VOLUME = 1;
const DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_EVENT_DURATION_MS = 10000;
const DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_GIFTED_EVENT_DURATION_MS = 10000;
export const DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_CONFIGURATION: TKickChannelEventsWidgetConfiguration = {
  chatroomId: NaN,
  admin: [],
  audioVolume: DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_AUDIO_VOLUME,
  audioTTSVolume: DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_TTS_AUDIO_VOLUME,
  subscriptionEventDurationMS: DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_EVENT_DURATION_MS,
  subscriptionGiftedEventDurationMS: DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_GIFTED_EVENT_DURATION_MS,
};

// --- Mappers ---
/**
 * Registry of mappers keyed by URL path.
 * Returns generic TWidgetConfiguration (or intersection) to be cast by the service.
 */
export const WIDGET_CONFIGURATION_MAPPERS: Record<string, (params: Params) => any> = {
  '/widgets/kick-channel-events': mapKickChannelEventsWidgetConfiguration,
};

function mapKickChannelEventsWidgetConfiguration(params: Params): TKickChannelEventsWidgetConfiguration {
  return {
    // Base configuration.
    chatroomId: requiredNumber(params['chatroomId'], 'chatroomId is required!'),
    admin: mapStringArray(params['admin']),

    // Additional configuration.
    audioVolume: number(params['audioVolume'], DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_AUDIO_VOLUME),
    audioTTSVolume: number(params['audioTTSVolume'], DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_TTS_AUDIO_VOLUME),
    subscriptionEventDurationMS: number(params['subscriptionEventDurationMS'], DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_EVENT_DURATION_MS),
    subscriptionGiftedEventDurationMS: number(params['subscriptionGiftedEventDurationMS'], DEFAULT_KICK_CHANNEL_EVENTS_WIDGET_SUBSCRIPTION_GIFTED_EVENT_DURATION_MS),
  };
}

/**
 * Helper to ensure a value is an array of strings.
 * Angular params can be a string (one value) or string[] (multiple values).
 */
function mapStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Helper to parse a number with a fallback default.
 */
function number(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Helper to parse a required number with an error fallback.
 */
function requiredNumber(value: string | undefined, errorMessage: string): number {
  if (value === undefined || value === null || value === '') throw new Error(errorMessage);
  const parsed: number = Number(value);
  if (isNaN(parsed)) throw new Error(errorMessage)
  return parsed;
}
