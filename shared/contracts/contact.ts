/**
 * Contact Domain Contract
 * Individual client or prospect record scoped to a Workspace.
 */

export interface Contact {
  id: string;
  workspaceId: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobile?: string;
  title?: string;
  preferredChannel?: 'SMS' | 'TELEGRAM' | 'EMAIL' | 'PHONE';
  telegramChatId?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactDTO {
  workspaceId: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobile?: string;
  title?: string;
  preferredChannel?: 'SMS' | 'TELEGRAM' | 'EMAIL' | 'PHONE';
  telegramChatId?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateContactDTO {
  companyId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  preferredChannel?: 'SMS' | 'TELEGRAM' | 'EMAIL' | 'PHONE';
  telegramChatId?: string;
  tags?: string[];
  notes?: string;
}
