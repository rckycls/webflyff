# Capture a Neuz login

This records one real login session, from the Windows client (Neuz) to your local servers, into a JSON file. The
protocol tests use that file as a fixture. You run it once.

It sits between Neuz and the servers, passes every byte through unchanged, and writes down each packet in both
directions. Use a throwaway account: its password and Bank PIN are saved in the file.

Run everything from the `FlyffWeb` folder.

## Steps

1. **Make the address local.** Neuz connects to `172.31.238.55` (compiled in as `NEUZ_IPSET`). Skip this step if this PC already answers on that address, which it does when Neuz normally reaches your local servers. Otherwise run, as administrator:

   ```
   netsh interface ipv4 add address "vEthernet (Default Switch)" 172.31.238.55 255.255.255.255
   ```

2. **Start the servers,** then run the capture command below with a throwaway account, its password and its 4-digit Bank PIN. The servers listen on all addresses, so the capture can take `172.31.238.55` on ports 23000 and 28000 for itself.

   ```
   npm run capture -- --listen 172.31.238.55 --target 127.0.0.1 --ports 23000,28000 --account <a> --password <p> --pin <pin> --out packages/protocol/test/fixtures/neuz-login.json
   ```

   Wait for the line `ready: start Neuz now`.

3. **Run Neuz and do one session:**
   - log in;
   - pick the first channel;
   - create a character in an empty slot (name `WebCapture1`) with that Bank PIN;
   - delete it with the same Bank PIN;
   - close Neuz at the character list. Don't enter the world.

4. **Press Ctrl+C** in the capture window. Then remove the address again, as administrator:

   ```
   netsh interface ipv4 delete address "vEthernet (Default Switch)" 172.31.238.55
   ```

   Skip this if you didn't add it.

5. **Fallback, only if step 2 fails with `EADDRINUSE`:** install Wireshark with Npcap, capture on the loopback adapter with filter `tcp port 23000 or tcp port 28000`, and send the `.pcapng` to Claude to convert.

## What you get

The file named by `--out` (`packages/protocol/test/fixtures/neuz-login.json`). The capture writes it every time a
connection closes and again on Ctrl+C, so closing the window by mistake loses little. It prints `saved N packets`
each time. If nothing was recorded it writes no file, so a mistaken run never wipes an earlier recording.

Each packet in the file has the server's port (23000 is the certifier, 28000 the login server), the connection
number, the direction (`c2s` is client to server, `s2c` is server to client) and the packet body in hex. The
file is meant to be committed, which is why the account has to be a throwaway one.
