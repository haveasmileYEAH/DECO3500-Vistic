Street Fake News Challenge — Quick Start
Prereqs

Node.js ≥ 18

A Supabase project (free tier OK)

1) Get the code & install
git clone <your-repo-url>
cd <repo-folder>
npm install

2) Configure environment

Create a .env file in the project root (do not commit it):

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# optional
SERVICE_ROLE_KEY=your_service_role_key
PORT=3000
PERM_ROOM=LEARN01


Tip: keep a committed .env.example (same keys, placeholder values) so teammates can copy:

cp .env.example .env

3) Initialize the database (once per Supabase project)

Open Supabase dashboard → SQL Editor

Paste & run the SQL from supabase/schema.sql (creates tables, RLS, RPC)

(Optional but recommended) Enable Realtime for public.votes and public.messages

SQL (can run once):

alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.messages;



In Settings → API, click Reload/Reset schema cache (updates API cache)

4) Run the app
npm start


Open:

Host page (Player 1): http://localhost:3000/player1

Challenger (Player 2): http://localhost:3000/player2

Audience voting: http://localhost:3000/audience?code=XXXXXX

Big screen display: http://localhost:3000/display?code=XXXXXX

5) How to run a round (demo flow)

On Player 1:

Click Generate to get a room code

(Optional) Fill Round Title/Body

Click Apply → this automatically creates/updates the round in Supabase

Share the code/QR:

Audience opens /audience?code=CODE to 👍/👎 and (optionally) post a reason

Big screen opens /display?code=CODE to show live stats & messages

If you click Apply again to update title/body and see an RLS error, add an UPDATE policy for rounds (one-time):

drop policy if exists "update_rounds" on public.rounds;
create policy "update_rounds" on public.rounds for update using (true) with check (true);

Troubleshooting (quick)

Round not found: Make sure you clicked Apply on Player 1 (creates the round).

Votes don’t update live: Ensure public.votes & public.messages are in supabase_realtime. Audience still auto-refreshes after voting.

Env missing: Visit http://localhost:3000/env.js — it should print your Supabase URL/Key; if empty, check .env and restart npm start.

That’s it. 🎉