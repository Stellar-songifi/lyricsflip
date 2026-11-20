/**
 * This file is auto-generated from backend/openapi.json.
 * Do NOT edit it manually.
 *
 * To regenerate after changing a backend DTO or route:
 *   cd backend
 *   npm run openapi:export
 *   npm run openapi:generate
 *   # then commit backend/openapi.json and this file
 *
 * CI will fail with a diff and the same instructions if this file is stale.
 */

export interface paths {
  "/health/live": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Liveness probe */
    get: operations["HealthController_live"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/health/ready": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Readiness probe */
    get: operations["HealthController_ready"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/health": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Readiness probe (alias) */
    get: operations["HealthController_check"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}

export type webhooks = Record<string, never>;

export interface components {
  schemas: Record<string, never>;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type $defs = Record<string, never>;

export interface operations {
  HealthController_live: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: Record<string, unknown>;
        content?: never;
      };
    };
  };
  HealthController_ready: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The Health Check is successful */
      200: {
        headers: Record<string, unknown>;
        content: {
          "application/json": {
            status?: string;
            info?: Record<string, unknown> | null;
            error?: Record<string, unknown> | null;
            details?: Record<string, unknown>;
          };
        };
      };
      /** @description The Health Check is not successful */
      503: {
        headers: Record<string, unknown>;
        content?: never;
      };
    };
  };
  HealthController_check: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The Health Check is successful */
      200: {
        headers: Record<string, unknown>;
        content?: never;
      };
      /** @description The Health Check is not successful */
      503: {
        headers: Record<string, unknown>;
        content?: never;
      };
    };
  };
}
