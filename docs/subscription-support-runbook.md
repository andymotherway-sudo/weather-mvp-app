# OMNIwx Subscription Support Runbook

Last reviewed: November 14, 2026

Status: pre-launch operating procedure. OMNIwx purchases are not enabled, and
this document does not authorize a product, production webhook, migration,
refund, deployment or charge.

## Support Boundaries

- Google Play processes Android payment credentials and store transactions.
- RevenueCat is the proposed verified subscription-state service.
- OMNIwx support may diagnose identity and entitlement synchronization but must
  never request a card number, password, service token or full purchase receipt.
- Refund decisions follow the published Play and OMNIwx policies in effect for
  the purchase. Support must not promise a refund before verifying the route.
- Official weather warnings remain available regardless of subscription state.

## Minimum Intake

Collect only the account email, OMNIwx app version, Android version, approximate
incident time and a user-redacted screenshot if useful. Ask the user to remove
precise coordinates, notification content and any receipt/order identifiers not
explicitly required by an approved escalation procedure.

## Purchase Not Recognized

1. Confirm the user is signed into the intended OMNIwx account and Play account.
2. Ask the user to use Restore Purchases once; do not instruct repeated buying.
3. Check the server entitlement status, latest verified event time and provider
   status without editing D1 manually.
4. If the provider is current but OMNIwx is not, open an engineering incident
   with redacted identifiers and preserve official Free features.
5. If Play reports pending, explain that Plus cannot be granted until payment is
   verified. Do not override the entitlement locally.

## Cancellation, Expiration And Refunds

- Direct cancellation to the Google Play subscription-management surface.
- A canceled subscription keeps Plus through its verified paid-through time.
- Grace, hold, refund and revocation behavior must follow verified server state,
  not a client toggle or support promise.
- Never delete saved data merely because access expires. Apply documented Free
  limits non-destructively and let the user choose retained active locations.

## Restore, Reinstall And Account Conflict

- Restore must be idempotent and tied to the authenticated OMNIwx identity.
- Do not silently transfer a purchase between OMNIwx accounts. Escalate conflicts
  under the approved RevenueCat restore/transfer policy.
- Offline cached Plus state may bridge a short verified window, but must not
  become a permanent grant after revocation or expiry.

## Account Deletion

1. Verify the authenticated account and show the user what will be deleted.
2. Explain that deleting OMNIwx data does not itself cancel a Play subscription.
3. Require the user to manage cancellation in Play before or after deletion.
4. Submit an idempotent deletion request, revoke sessions, delete or anonymize
   owned data under the published retention schedule, then provide confirmation.
5. Preserve only records legally or operationally required by the published
   policy, with access restricted and a defined deletion date.

## Escalation Targets Before Paid Launch

- Named product owner for refund and goodwill decisions.
- Named engineering owner for entitlement and webhook incidents.
- Published response targets for purchase loss, account deletion and outages.
- Tested provider dashboards, redacted support tooling and an incident template.
- A public support page, privacy policy, Terms of Service and external deletion
  request path that match the released build.
