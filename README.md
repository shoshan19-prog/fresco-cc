# Fresco Command Center — mobile UI

Static page only. **No credential of any kind lives in this repository** — it holds
only the public API URL of the Fresco Supabase project.

Access is gated by a code entered at login, which is verified server-side against a
SHA-256 hash stored in an RLS-locked table. Nothing in this repo grants any access
by itself.

The application logic, data and privileged credentials all live server-side in the
private `fresco-marketing-os` project.
