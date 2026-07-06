const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const {
  changePassword,
  clearSessionImpersonatedUser,
  clearOauthStateCookie,
  clearSessionCookie,
  getSessionContext,
  getSessionUser,
  login,
  loginWithGoogle,
  logout,
  oauthStateCookie,
  readOauthState,
  setSessionImpersonatedUser,
  sessionCookie
} = require('../lib/auth');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function requestAction(req) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  return String(url.searchParams.get('action') || '').trim().toLowerCase();
}

function requestUrl(req) {
  return new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
}

function baseUrl() {
  const url = String(process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
  if (!url) throw new Error('NEXTAUTH_URL is required for Google OAuth.');
  return url;
}

function googleClient() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google OAuth.');
  }
  return new OAuth2Client(clientId, clientSecret, `${baseUrl()}/api/auth?action=callback`);
}

function redirect(res, location, cookies = []) {
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.setHeader('Location', location);
  res.status(302).end();
}

function authErrorUrl(message = 'Access not authorized. Contact PMO.') {
  return `/auth-error?message=${encodeURIComponent(message)}`;
}

module.exports = async function authHandler(req, res) {
  const action = requestAction(req);
  const url = requestUrl(req);

  if (req.method === 'GET' && action === 'google') {
    try {
      const state = crypto.randomBytes(24).toString('base64url');
      const client = googleClient();
      const consentUrl = client.generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        hd: 'azumo.co',
        state
      });
      const payload = Buffer.from(JSON.stringify({
        state,
        exp: Date.now() + (10 * 60 * 1000)
      })).toString('base64url');
      redirect(res, consentUrl, [oauthStateCookie(payload)]);
    } catch (error) {
      redirect(res, authErrorUrl('Google sign-in is currently unavailable. Contact PMO.'), [clearOauthStateCookie()]);
    }
    return;
  }

  if (req.method === 'GET' && action === 'callback') {
    try {
      if (url.searchParams.get('error')) {
        redirect(res, authErrorUrl('Google sign-in was cancelled.'), [clearOauthStateCookie()]);
        return;
      }

      const expectedState = readOauthState(req);
      const returnedState = String(url.searchParams.get('state') || '');
      const code = String(url.searchParams.get('code') || '');
      if (!expectedState || !returnedState || !code || expectedState.state !== returnedState || Number(expectedState.exp || 0) < Date.now()) {
        redirect(res, authErrorUrl('Authentication expired. Please sign in again.'), [clearOauthStateCookie()]);
        return;
      }

      const client = googleClient();
      const { tokens } = await client.getToken(code);
      if (!tokens?.id_token) {
        redirect(res, authErrorUrl('Authentication failed. Please try again.'), [clearOauthStateCookie()]);
        return;
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: String(process.env.GOOGLE_CLIENT_ID || '').trim()
      });
      const payload = ticket.getPayload() || {};
      const email = String(payload.email || '').trim().toLowerCase();
      const emailVerified = Boolean(payload.email_verified);
      if (!emailVerified || !email.endsWith('@azumo.co')) {
        console.error('[auth-debug] domain/verification check failed', { email, emailVerified });
        redirect(res, authErrorUrl('Access not authorized. Contact PMO.'), [clearOauthStateCookie()]);
        return;
      }

      let result;
      try {
        result = await loginWithGoogle(email);
      } catch (dbError) {
        console.error('[auth-debug] loginWithGoogle threw', email, dbError && dbError.stack || dbError);
        throw dbError;
      }
      if (!result || !result.user || result.user.active === false) {
        console.error('[auth-debug] loginWithGoogle returned no active user', { email, result: result ? { hasUser: !!result.user, active: result.user && result.user.active } : null });
        redirect(res, authErrorUrl('Access not authorized. Contact PMO.'), [clearOauthStateCookie()]);
        return;
      }

      redirect(res, '/', [clearOauthStateCookie(), sessionCookie(result.token)]);
    } catch (error) {
      console.error('[auth-debug] callback outer catch', error && error.stack || error);
      redirect(res, authErrorUrl('Authentication failed. Please try again.'), [clearOauthStateCookie()]);
    }
    return;
  }

  if (req.method === 'GET' && action === 'debug-env') {
    res.status(200).json({
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      PMO_DEV_BYPASS: process.env.PMO_DEV_BYPASS || null
    });
    return;
  }

  if (req.method === 'GET' && (!action || action === 'me')) {
    try {
      const context = await getSessionContext(req);
      res.status(200).json({
        user: context.realUser || null,
        effective_user: context.user || null,
        impersonation: context.impersonatedUser
          ? { active: true, user: context.impersonatedUser }
          : { active: false, user: null }
      });
    } catch (error) {
      res.status(200).json({
        user: null,
        effective_user: null,
        impersonation: { active: false, user: null }
      });
    }
    return;
  }

  if (req.method === 'GET' && action === 'impersonate') {
    try {
      const context = await getSessionContext(req);
      if (!context.realUser || context.realUser.active === false || context.realUser.role !== 'PMO') {
        res.status(403).json({ error: 'Administrator access required.' });
        return;
      }

      const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) {
        res.status(400).json({ error: 'Email is required.' });
        return;
      }

      const user = await setSessionImpersonatedUser(req, email);
      res.status(200).json({
        ok: true,
        user: context.realUser,
        effective_user: user,
        impersonation: { active: true, user }
      });
    } catch (error) {
      const message = error?.message || 'Could not start impersonation.';
      const status = /access required/i.test(message) ? 403 : /required|cannot be impersonated|not found|inactive/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
    return;
  }

  if (req.method === 'GET' && action === 'stop-impersonation') {
    try {
      const context = await getSessionContext(req);
      if (!context.realUser || context.realUser.active === false || context.realUser.role !== 'PMO') {
        res.status(403).json({ error: 'Administrator access required.' });
        return;
      }

      const user = await clearSessionImpersonatedUser(req);
      res.status(200).json({
        ok: true,
        user: user || context.realUser || null,
        effective_user: user || context.realUser || null,
        impersonation: { active: false, user: null }
      });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Could not stop impersonation.' });
    }
    return;
  }

  if (req.method === 'POST' && action === 'login') {
    try {
      const body = await readJson(req);
      const result = await login(body.email, body.password);
      res.setHeader('Set-Cookie', sessionCookie(result.token));
      res.status(200).json({ user: result.user });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
    return;
  }

  if ((req.method === 'POST' && action === 'logout') || (req.method === 'DELETE' && (!action || action === 'logout'))) {
    try {
      await logout(req);
    } finally {
      res.setHeader('Set-Cookie', [clearSessionCookie(), clearOauthStateCookie()]);
      res.status(200).json({ ok: true });
    }
    return;
  }

  if ((req.method === 'POST' && action === 'change-password') || (req.method === 'PATCH' && (!action || action === 'change-password'))) {
    try {
      const body = await readJson(req);
      const user = await changePassword(req, body.currentPassword, body.newPassword);
      res.status(200).json({ ok: true, user });
    } catch (error) {
      const status = /signed in|incorrect/i.test(error.message) ? 401 : 400;
      res.status(status).json({ error: error.message });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
