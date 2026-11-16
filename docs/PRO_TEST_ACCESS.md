# Manual Pro access for test accounts

Payment processing is intentionally on hold. For testing, an administrator can manually manage the server-side Firestore subscription record.

## Required document

In Firebase Console → Firestore Database, use the collection/document path:

`subscriptions/{FIREBASE_AUTH_UID}`

Create or update the document with:

| Field | Value | Type |
|---|---|---|
| `plan` | `pro` | string |
| `status` | `active` | string |
| `currentPeriodEnd` | A future date/time | Firestore Timestamp |

Example only:

```json
{
  "plan": "pro",
  "status": "active",
  "currentPeriodEnd": "Set this as a Firestore Timestamp in the Console"
}
```

Use the Firebase Authentication UID of the testing account, not its email address, as the document ID. Set `currentPeriodEnd` using the Firestore Console's Timestamp type and choose an explicit expiry. The app does not accept a browser-side `isPro` flag.

The server grants Pro only when all three conditions are met: plan is `pro`, status is `active` or `trialing`, and the period end is in the future.

## Revoke test access

Set `plan` to `free`, set status to `canceled`, or set the timestamp to a past date.

## Security

The Firestore rules explicitly deny all client reads and writes to `subscriptions/{uid}`. Do not relax those rules for testing. Firebase Admin reads the record server-side and bypasses client rules under the configured server identity. Never place subscription grants in a user-editable profile document.

This is a manual test workflow only. A payment provider and signed webhook verification must be implemented before selling Pro or automating renewals, cancellations, failed payments and refunds.
