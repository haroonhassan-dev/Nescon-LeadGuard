/**
 * Integrations Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Integration status badges (Twilio, Stripe test mode, Google Calendar, Telegram), webhook logs.
 */

export interface IntegrationConnectionStatus {
  twilioConnected: boolean;
  stripeTestModeActive: boolean;
  googleCalendarConnected: boolean;
  telegramBotActive: boolean;
}

export const initialIntegrationsStatus: IntegrationConnectionStatus = {
  twilioConnected: false,
  stripeTestModeActive: true,
  googleCalendarConnected: false,
  telegramBotActive: false,
};
