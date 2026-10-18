/**
 * CRM Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Contact lists, company cards, pipeline board, deal progression.
 */

export interface CrmModuleState {
  isLoaded: boolean;
  activeContactId?: string;
  activePipelineId?: string;
}

export const crmInitialState: CrmModuleState = {
  isLoaded: false,
};
