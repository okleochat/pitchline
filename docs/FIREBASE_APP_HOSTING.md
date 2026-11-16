# Firebase App Hosting for Pitchline

Pitchline is a Next.js application with server-rendered routes, Firebase session cookies and Node.js API handlers. Use **Firebase App Hosting**, not a static-only Firebase Hosting export.

## Configuration in this repository

The root `apphosting.yaml` is prepared for the Firebase Web App `pitchline-app`:

- Public Firebase Web SDK values are available at build/runtime.
- The server uses Application Default Credentials (ADC) on App Hosting. `src/lib/firebase/admin.ts` falls back to ADC when `FIREBASE_SERVICE_ACCOUNT_JSON` is absent.
- Cloud Run is configured with scale-to-zero (`minInstances: 0`), a maximum of four instances, 1 CPU and 1 GiB memory as an initial cost-conscious cap.
- xG and odds add-on flags remain disabled until a provider key and verified coverage are available.

Vercel can continue to use its existing sensitive `FIREBASE_SERVICE_ACCOUNT_JSON` variable. Do not put service-account JSON into this repository or `apphosting.yaml`.

## Create the Firebase App Hosting backend

This part requires an owner/admin action in Firebase Console; the GitHub repository alone cannot create the backend.

1. Open Firebase Console and select `pitchline-app`.
2. Go to **Hosting & Serverless → App Hosting** and choose **Get started / Create backend**.
3. App Hosting requires the **Blaze pay-as-you-go plan**. Add billing only after setting a Google Cloud budget alert and reviewing the Cloud Run spend controls.
4. Connect GitHub and grant the Firebase App Hosting / Developer Connect integration access to `okleochat/pitchline`.
5. Set the app root directory to `/`, select the `main` live branch and enable automatic rollouts.
6. Choose a supported region close to the audience and create the backend.
7. Give the App Hosting runtime service account the least-privilege Firebase Authentication and Firestore permissions needed by Pitchline. App Hosting supplies ADC; no downloaded private key is needed for this runtime.
8. Add the App Hosting hostname under Firebase Authentication → Settings → Authorized domains. Keep the existing Vercel domain authorized while both deployments are in use.
9. After the first rollout succeeds, test `/api/health`, email/password and Google sign-in, cookie/session verification, and the manually managed Pro subscription document.

The Firebase App Hosting hostname can be used alongside the existing Vercel hostname. For a custom domain, use a separate hostname such as `app.` until you deliberately move DNS; one hostname cannot point to two production origins simultaneously.

## Billing and limits

App Hosting is not a no-billing workaround. It requires Blaze, but currently includes monthly no-cost quotas for portions of Cloud Run, Cloud Build, bandwidth and storage. Usage above those allowances is billed by the underlying Google Cloud services. Set a budget alert and a Cloud Run maximum-instance cap before sending real traffic.

## Deployment strategy

Recommended:
- Firebase App Hosting: second production-capable deployment from `main`, with a separate hostname for failover/testing.
- Vercel: keep current production deployment until Firebase has passed end-to-end checks.
- GitHub Actions: run typecheck, tests and a production build once per PR; avoid creating unnecessary Vercel preview deployments while the Hobby deployment allowance is exhausted.

Do not switch the primary public domain or disable the Vercel production project until Firebase's live deployment, authentication, API routes and data flows have been independently verified.
