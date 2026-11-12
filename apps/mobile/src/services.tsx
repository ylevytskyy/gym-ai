/**
 * The outside world the app talks to: Supabase, the health store and small on-device
 * preferences. Screens get these from context, so tests can hand in fakes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, type ReactNode } from 'react';

import type { HealthController } from '@/health/controller';

export interface Services {
  supabase: Pick<SupabaseClient, 'auth' | 'from'>;
  health: HealthController;
  /** Today's local day (YYYY-MM-DD); injectable so tests are not tied to the clock. */
  today: () => string;
  /** Base URL of the assistant service that makes plans. */
  assistantUrl: string;
  fetch: typeof fetch;
  /** Public URL of a file in the exercise-media bucket. */
  mediaUrl: (file: string) => string;
  /** A new unique id for a row the app creates. */
  newId: () => string;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}
