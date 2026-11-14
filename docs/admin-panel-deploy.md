# Admin panel: your steps (VM first, then the VPS)

The panel is built and tested on this PC against made-up data. These steps put it on the real database: first in the
Hyper-V VM, then on the live server. The full how-to of each step is `docs/hosting.md`, step 8b.

## 1. In the Hyper-V VM

1. Get this branch's FlyffWeb into the VM as you do for other updates, then `npm install` there.
2. **The SQL login.** In an administrator PowerShell in the VM:

   ```
   cd <FlyffWeb>\apps\web\sql
   powershell -ExecutionPolicy Bypass -File .\Install-AdminLogin.ps1
   ```

   Pass: it ends with `Check passed: flyffweb_admin logged in ...`.
3. **The check script.** In SQL Server Management Studio, connect **as `flyffweb_admin`** (SQL Server Authentication) and
   run `apps\web\sql\admin-check.sql`. Pass: 6 lines, every one starting with `PASS`.
4. **Your panel login.** In `<FlyffWeb>`: `npm run admin:setup -- --file C:\flyff-web\admin-login.json` (add the key to
   your authenticator app; type its code). Pass: `Written: ...`.
5. **The settings.** Add the `admin` section of hosting step 8b, point 4, to the VM's `web.config.json`, but with
   `"origin": "http://127.0.0.1:8092"` (no Caddy in the VM). Restart the web service (or `npm run web`).
   Pass: its log has `admin: listening 127.0.0.1:8092`.
6. **Try it.** Open `http://127.0.0.1:8092` in a browser **inside the VM** and log in. Pass:
   - Status lists the 7 servers with the right up or down;
   - Accounts finds your account; Characters finds a character;
   - with the servers running, a rename says "character edits locked"; with Database and World stopped, it works;
   - Send: send one cheap item to a test character, log in with it in the game: the item arrives;
   - the Log tab shows every one of those changes.

## 2. On the VPS (osflyff.online)

1. **DNS.** Add an A record `admin` with the VPS's address. Pass: `nslookup admin.osflyff.online` prints it.
2. **The update.** `deploy\Update-FlyffWeb.ps1 -FlyffWebOnly` (or your usual pull and `npm install`).
3. Points 2, 3 and 4 of the VM part, on the VPS.
4. **The settings and Caddy.** Hosting step 8b, points 4 and 5, with `admin.osflyff.online`: the `admin` section with
   `"origin": "https://admin.osflyff.online"`, and the Caddy block. If you use `deploy.json`, set `"adminPanel": true`
   and run `4-Setup-FlyffWeb` instead (the deploy-script update on branch `admin-panel-deploy` of the server repo).
5. **Restart:** `nssm restart flyff-caddy`, then `nssm restart flyffweb-site`.
   Pass: `web.log` has `admin: listening 127.0.0.1:8092`.
6. **Try it** from your PC and your phone: `https://admin.osflyff.online`. Pass:
   - the login box shows; a wrong code is refused;
   - you log in, and Status lists the 7 servers;
   - `https://osflyff.online` and sign-up work as before.

## If something goes wrong

- **`admin: panel off: <reason>`** in `web.log`: the reason names the setting or file to fix. The site keeps working.
- **Lost phone or leaked password:** run `npm run admin:setup` again (new password, new key) and restart `flyffweb-site`.
- **Switch it off at once:** remove the `admin` section from `web.config.json` (and `"adminPanel": false` in
  `deploy.json`), then `nssm restart flyffweb-site`.

## Tests you can run on the PC

```
npm test
npm run test:e2e:admin
```

Pass: `npm test` all green (the old known failures in `inventoryWindow` and `looks`, if any, are not the panel's);
`test:e2e:admin` prints `11 passed`. `npm run admin:demo` starts the panel on `http://127.0.0.1:8099` with made-up data
(log in as `Poreotix` / `demo-password-1` with the code it prints).
