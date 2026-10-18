/**
 * Company Domain Contract
 * Corporate or organizational account scoped to a Workspace.
 */

export interface Company {
  id: string;
  workspaceId: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  phone?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyDTO {
  workspaceId: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  phone?: string;
  website?: string;
  address?: Company['address'];
}

export interface UpdateCompanyDTO {
  name?: string;
  domain?: string;
  industry?: string;
  size?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  phone?: string;
  website?: string;
  address?: Company['address'];
}
