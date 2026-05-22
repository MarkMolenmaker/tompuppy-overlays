import { inject, Injectable } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, Params } from '@angular/router';
import { WIDGET_CONFIGURATION_MAPPERS } from '../common/widget-configuration';

/**
 * WidgetConfigurationService reads and maps the widget configuration from the URL.
 * * Usage:
 * Inject this service in your component providers to scope it to the current route.
 */
@Injectable()
export class WidgetConfigurationService<T> {
  // The strictly typed widget configuration.
  private readonly configuration: T;

  // We inject ActivatedRoute to get the snapshot of the current route context.
  private readonly snapshot: ActivatedRouteSnapshot = inject(ActivatedRoute).snapshot;

  constructor() {
    // Construct the path (e.g., '/widgets/plinko')
    // Note: depending on your routing depth, you might need to build this differently.
    // This approach joins the current route's segments.
    const path = '/' + this.snapshot.url.map(segment => segment.path).join('/');

    const params: Params = this.snapshot.queryParams;

    // Find the mapper for this path
    const mapper = WIDGET_CONFIGURATION_MAPPERS[path];

    if (!mapper) {
      throw new Error(`No configuration mapper found for widget path: ${path}`);
    }

    // Map and assign the configuration
    try {
      this.configuration = mapper(params) as T;
    } catch (e) {
      throw new Error(`Failed to map configuration for ${path}: ${e}`);
    }
  }

  /**
   * Retrieves the current configuration of the widget.
   */
  getWidgetConfiguration(): T {
    return this.configuration;
  }
}
