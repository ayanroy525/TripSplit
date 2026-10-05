# TripSplit Vercel Deployment Guide

## Problem Fixed

Previously, the app was set up as a local Express server but Vercel was not running it in production, causing login/signup to fail with 404 errors.

**Root Cause:**
- Frontend called `/api/auth/login` and `/api/auth/signup`
- Local development: `npm run dev` → Express server on port 3000 → routes exist
- Vercel production: No Express server running → routes don't exist → 404 errors

**Solution:**
- Added Vercel serverless API routes under `/api/[[...slug]].ts`
- Removed broken `/api/(.*)` rewrite in `vercel.json`
- Frontend continues calling the same `/api/...` paths, but now they're served by Vercel Functions

---

## Deployment Steps

### 1. **Merge or Deploy the Fix Branch**

The fix is in the `fix/vercel-api-routes` branch. Deploy from this branch or merge it to main:

```bash
git checkout fix/vercel-api-routes
git pull origin fix/vercel-api-routes
```

### 2. **Set Environment Variables in Vercel**

Go to your Vercel project dashboard → **Settings** → **Environment Variables** and add these variables for **Production**:

#### Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Required for Vercel |
| `POSTGRES_URL` | Your PostgreSQL connection string | Database URL with connection pooling |
| `POSTGRES_URL_NON_POOLING` | Your PostgreSQL connection string (non-pooling) | Used in serverless routes |
| `PASSWORD_SALT` | Any secure string (e.g., `your-secure-salt-key`) | For password hashing |
| `SESSION_SECRET` | Any secure string (e.g., `your-session-secret-key`) | For JWT token generation |
| `AUTH_SECRET` | Any secure string | Fallback for both PASSWORD_SALT and SESSION_SECRET if not set separately |

#### Optional Variables (Supabase)

If using Supabase for additional features:

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Frontend Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | Frontend Supabase auth |
| `SUPABASE_URL` | Your Supabase project URL | Backend Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Backend admin access |

### 3. **Database Connection String**

For `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`, use your PostgreSQL connection string:

```
postgresql://username:password@host:5432/database_name
```

**Note:** If using Vercel Postgres, they'll automatically inject `POSTGRES_URL`. For external databases (e.g., AWS RDS, Neon), add manually.

### 4. **Redeploy**

Once environment variables are set:

1. Push the fix branch to GitHub
2. Vercel will automatically redeploy
3. Monitor the deployment in Vercel dashboard

Alternatively, manually trigger a redeploy:
- Go to Vercel project → Deployments → Select latest → Click **Redeploy**

---

## Testing the Fix

After deployment, test the API endpoints:

### Health Check
```bash
curl https://your-vercel-url.vercel.app/api/health
# Response: { "status": "ok" }
```

### Database Status
```bash
curl https://your-vercel-url.vercel.app/api/db/status
# Response: { "connected": true, "latencyMs": X, ... }
```

### Login (Frontend)
Open the app in browser and try logging in. It should now:
1. Call POST `/api/auth/login`
2. Hit the Vercel serverless function
3. Query the database
4. Return a valid session token

### Signup (Frontend)
Try creating a new account. It should now:
1. Call POST `/api/auth/signup`
2. Hit the Vercel serverless function
3. Create the user in the database
4. Return a valid session token

---

## Common Issues

### Issue: 503 "Database service temporarily offline"
**Cause:** `POSTGRES_URL` or `POSTGRES_URL_NON_POOLING` not set or invalid

**Fix:** Verify the connection string in Vercel environment variables

### Issue: 401 "Authentication required" on protected routes
**Cause:** Missing Bearer token or invalid session secret

**Fix:** Ensure `SESSION_SECRET` is set and matches across all deployments

### Issue: 409 "Account already exists" on signup
**Cause:** Email or phone already registered

**Fix:** Expected behavior. User should log in instead.

### Issue: 500 "Internal authentication error"
**Cause:** Server-side error in login/signup handler

**Fix:** Check Vercel logs:
- Vercel Dashboard → Functions → Select function → View logs
- Look for database query errors or connection issues

---

## Local Development

To test API routes locally during development:

```bash
npm run dev
```

This starts the Express server on port 3000 with API routes at `/api/...`

To mimic Vercel's serverless environment locally:
```bash
npm run build
npm run preview
```

This builds the Vite app and starts a preview server.

---

## Monitoring

Monitor your Vercel deployment:

1. **Vercel Dashboard**
   - Check function execution time
   - Monitor error rates
   - View runtime logs

2. **Database Logs**
   - Check PostgreSQL slow query logs
   - Monitor connection pool usage
   - Verify query performance

---

## Next Steps

1. ✅ Deploy the fix branch
2. ✅ Set environment variables in Vercel
3. ✅ Test login/signup
4. ✅ Monitor logs for errors
5. Consider: Add rate limiting to `/api/auth/*` routes for security
6. Consider: Set up monitoring/alerting for API errors

---

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Environment Variables: https://vercel.com/docs/concepts/projects/environment-variables
- Serverless Functions: https://vercel.com/docs/functions/serverless-functions
- Database Connections: https://vercel.com/docs/storage/postgres
