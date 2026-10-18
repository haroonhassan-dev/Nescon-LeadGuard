/**
 * Opportunity Domain Contract
 * Deals attached to contacts/companies and tracked through pipeline stages.
 */

export type OpportunityStatus = 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';

export interface Opportunity {
  id: string;
  workspaceId: string;
  title: string;
  value: number;
  currency: string;
  probability: number; // 0 to 100 percentage
  pipelineId: string;
  stageId: string;
  contactId?: string;
  companyId?: string;
  assignedUserId?: string;
  status: OpportunityStatus;
  expectedCloseDate?: string;
  actualCloseDate?: string;
  lossReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOpportunityDTO {
  workspaceId: string;
  title: string;
  value: number;
  currency?: string;
  probability?: number;
  pipelineId: string;
  stageId: string;
  contactId?: string;
  companyId?: string;
  assignedUserId?: string;
  expectedCloseDate?: string;
  notes?: string;
}

export interface UpdateOpportunityDTO {
  title?: string;
  value?: number;
  currency?: string;
  probability?: number;
  stageId?: string;
  assignedUserId?: string;
  status?: OpportunityStatus;
  expectedCloseDate?: string;
  actualCloseDate?: string;
  lossReason?: string;
  notes?: string;
}
