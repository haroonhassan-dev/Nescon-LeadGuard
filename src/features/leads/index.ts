/**
 * Leads Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Lead inbox, SLA countdown timers, single-owner claim button, acknowledgment modals.
 */

import { Lead } from '@shared/lead';

export interface LeadsModuleState {
  leads: Lead[];
  selectedLeadId?: string;
  isClaiming: boolean;
}

export const leadsInitialState: LeadsModuleState = {
  leads: [],
  isClaiming: false,
};
