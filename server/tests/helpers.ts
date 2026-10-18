/**
 * Test helpers. Tests run against the real database in DATABASE_URL (no mocks) on an
 * ephemeral port, with the background worker disabled so each test drives the engine itself.
 * Every run uses fresh random emails; audit rows are append-only, so test workspaces remain.
 */
import 'dotenv/config';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { randomToken } from '../src/lib/crypto';

export { prisma };

export interface Api {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startApi(): Promise<Api> {
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface CallResult {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function call(
  api: Api,
  method: string,
  path: string,
  opts: { token?: string; workspace?: string; body?: unknown } = {}
): Promise<CallResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.workspace) headers['X-Workspace-Id'] = opts.workspace;
  const res = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const uniqueEmail = (label: string) => `${label}-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}@tests.test`;
export const PASSWORD = `Test-${randomToken(10)}`;

export interface Member {
  userId: string;
  token: string;
  email: string;
}

export interface TestWorkspace {
  workspaceId: string;
  formKey: string;
  owner: Member;
  roles: Record<string, string>;
}

export async function signupWorkspace(api: Api, name = 'Test Co'): Promise<TestWorkspace> {
  const email = uniqueEmail('owner');
  const res = await call(api, 'POST', '/api/auth/signup', {
    body: { workspaceName: name, firstName: 'Owner', lastName: 'Person', email, password: PASSWORD },
  });
  if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  const workspaceId = res.body.data.workspace.id;
  const roles = await prisma.role.findMany({ where: { workspaceId } });
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  return {
    workspaceId,
    formKey: ws.publicFormKey,
    owner: { userId: res.body.data.user.id, token: res.body.data.token, email },
    roles: Object.fromEntries(roles.map((r) => [r.name, r.id])),
  };
}

/** Invites through the API and accepts the invitation, like a real employee would. */
export async function addMember(
  api: Api,
  ws: TestWorkspace,
  opts: { label: string; role?: 'User' | 'Manager' | 'Admin'; baseLevel?: 'USER' | 'ADMIN'; availability?: string }
): Promise<Member> {
  const email = uniqueEmail(opts.label);
  const invite = await call(api, 'POST', '/api/team/invitations', {
    token: ws.owner.token,
    workspace: ws.workspaceId,
    body: { email, baseLevel: opts.baseLevel ?? 'USER', roleId: ws.roles[opts.role ?? 'User'] },
  });
  if (invite.status !== 201) throw new Error(`invite failed: ${JSON.stringify(invite.body)}`);
  const accepted = await call(api, 'POST', '/api/auth/accept-invite', {
    body: { token: invite.body.data.inviteToken, firstName: opts.label, lastName: 'Tester', password: PASSWORD },
  });
  if (accepted.status !== 200) throw new Error(`accept failed: ${JSON.stringify(accepted.body)}`);
  const member = { userId: accepted.body.data.user.id, token: accepted.body.data.token, email };
  if (opts.availability) {
    const set = await call(api, 'PATCH', '/api/team/me/availability', {
      token: member.token,
      workspace: ws.workspaceId,
      body: { availability: opts.availability },
    });
    if (set.status !== 200) throw new Error(`availability failed: ${JSON.stringify(set.body)}`);
  }
  return member;
}

/** Moves a lead's deadline into the past, as if its window had run out. */
export async function expireDeadline(leadId: string): Promise<void> {
  await prisma.lead.update({ where: { id: leadId }, data: { ackDeadline: new Date(Date.now() - 1000) } });
}
