import {Injectable, signal} from '@angular/core';
import {catchError, defer, finalize, map, Observable, of, shareReplay, tap} from 'rxjs';

// Constants.
const KICK_BADGE_IMAGE = "https://www.kickdatabase.com/kickBadges";

@Injectable({
  providedIn: 'root',
})
export class KickApiService {
  private readonly cachedProfilePictures = signal<Map<string, string>>(new Map());

  /**
   * Keeps track of in-flight requests per slug so multiple consumers
   * share a single API call.
   */
  private readonly inFlightProfilePictures = new Map<string, Observable<string>>();

  constructor() { }

  /**
   * Returns the profile picture URL for the given user.
   * Uses an in-memory cache and de-duplicates concurrent requests per slug.
   *
   * @param slug The user's slug.
   * @returns Observable emitting the profile picture URL (or '' if not found).
   */
  getProfilePictureUrl(slug: string): Observable<string> {
    const normalized = (slug ?? '').trim().toLowerCase();
    if (!normalized) return of('');

    const cached = this.cachedProfilePictures();
    if (cached.has(normalized)) return of(cached.get(normalized)!);

    const existingInFlight = this.inFlightProfilePictures.get(normalized);
    if (existingInFlight) return existingInFlight;

    const request$ = this.getProfile(normalized).pipe(
      map((data) => data.profile_pic || data.user?.profile_pic || ''),
      tap((url) => {
        // Cache the result (including empty string) to avoid repeatedly calling the API.
        const next = new Map(this.cachedProfilePictures());
        next.set(normalized, url);
        this.cachedProfilePictures.set(next);
      }),
      catchError(() => {
        // On error, cache empty to avoid hammering the API if the UI re-renders frequently.
        const next = new Map(this.cachedProfilePictures());
        next.set(normalized, '');
        this.cachedProfilePictures.set(next);
        return of('');
      }),
      finalize(() => {
        this.inFlightProfilePictures.delete(normalized);
      }),
      // Share the single fetch among all subscribers and replay the result.
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inFlightProfilePictures.set(normalized, request$);
    return request$;
  }

  /**
   * Generates the URL for a specific badge image if the badge is valid.
   *
   * @param {string} badge - The type of badge for which the URL is to be generated. Must be one of the following:
   * 'broadcaster', 'moderator', 'vip', 'og', 'founder', 'subscriber', 'staff', 'verified', 'sidekick'.
   * @return {string | null} The URL of the badge image if the badge is valid, otherwise null.
   */
  getBadgeUrl(badge: string): string | null {
    if (!['broadcaster', 'moderator', 'vip', 'og', 'founder', 'subscriber', 'staff', 'verified', 'sidekick'].includes(badge)) return null;
    return `${KICK_BADGE_IMAGE}/${badge}.svg`;
  }

  /**
   * Retrieves the unique identifier for a chatroom based on its slug.
   *
   * @param slug The unique slug representing the chatroom.
   * @return An observable that emits the unique identifier for the specified chatroom.
   */
  getChatroomId(slug: string): Observable<number> {
    const normalized = (slug ?? '').trim().toLowerCase();
    if (!normalized) return of(NaN);

    return this.getChatroom(normalized).pipe(
      map((data) => data.id || NaN),
      catchError(() => of(NaN)),
    );
  }

  private getProfile(slug: string): Observable<any> {
    return defer(() =>
      fetch(`https://kick.com/api/v2/channels/${slug}/users/${slug}`, {
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
          Accept: 'application/json',
          'Accept-Language': 'nl,en-US;q=0.9,en;q=0.8',
          'Alt-Used': 'kick.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          Priority: 'u=0',
          'Cache-Control': 'max-age=0',
        },
        referrer: 'https://kick.com/',
        method: 'GET',
        mode: 'cors',
      })
        .then((response) => response.json())
    );
  }

  private getChatroom(slug: string): Observable<any> {
    return defer(() =>
      fetch(`https://kick.com/api/v2/channels/${slug}/chatroom`, {
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
          Accept: 'application/json',
          'Accept-Language': 'nl,en-US;q=0.9,en;q=0.8',
          'Alt-Used': 'kick.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          Priority: 'u=0',
          'Cache-Control': 'max-age=0',
        },
        referrer: 'https://kick.com/',
        method: 'GET',
        mode: 'cors',
      })
        .then((response) => response.json())
    );
  }
}
