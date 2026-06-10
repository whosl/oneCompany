/** Result from authorizeIntegrationWrite — sync path used by UI and workflow today. */
export type IntegrationAuthorizeResult =
  | { allow: true }
  | { allow: false; reason: string }
  | { pending: true; gateId: string; message?: string };

export function isIntegrationAuthorizePending(
  result: IntegrationAuthorizeResult,
): result is { pending: true; gateId: string; message?: string } {
  return "pending" in result && result.pending === true;
}

export function isIntegrationAuthorizeAllowed(
  result: IntegrationAuthorizeResult,
): result is { allow: true } {
  return "allow" in result && result.allow === true;
}
