/**
 * Pipeline Domain Contract
 * Customizable sales and service stages for deals and lead progression.
 */

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  color: string; // Hex color e.g. #B7F45B
  slaMinutes?: number; // Target maximum time allowed in this stage
  isWonStage: boolean;
  isLostStage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePipelineDTO {
  workspaceId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  stages: Array<{
    name: string;
    order: number;
    color: string;
    slaMinutes?: number;
    isWonStage?: boolean;
    isLostStage?: boolean;
  }>;
}

export interface UpdatePipelineDTO {
  name?: string;
  description?: string;
  isDefault?: boolean;
}
